// シーンで共通に使う画面操作。患者のカルテを開く・検索モーダルの行を選ぶ・カードを消すなど。

/** 患者検索から、名前で 1 人に絞った患者のカルテを開く。 */
export async function openKarte(page, patientName) {
  await page.goto("/patients");
  await page.getByLabel("氏名(漢字・カナ部分一致)").fill(patientName);
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const rows = page.getByRole("row").filter({ hasText: patientName });
  await rows.first().waitFor();
  if ((await rows.count()) !== 1) throw new Error(`患者「${patientName}」が 1 人に絞れません`);
  await rows.getByRole("link", { name: "カルテ" }).click();
  await page.locator(".karte-right").waitFor();
}

/** 検索モーダルの行は、行そのものを押して選ぶ。行の端の「DI」リンクなどに当たらないよう 2 列目を押す。 */
export async function pickRow(row) {
  await row.locator("td").nth(1).click();
}

/** 項目ラベルに包まれた入力部品。ラベルの文字ごと枠で囲むと、どの項目かが写真で分かる。 */
export function labeled(scope, text) {
  return scope.locator("label").filter({ hasText: text }).first();
}

/** 行のメニュー(⋮)を開いたときの項目。 */
export function menuItem(page, text) {
  return page.locator(".row-menu__item", { hasText: new RegExp(`^${text}$`) });
}

/**
 * 部品の位置と大きさが落ち着くまで待つ。中身が後から読み込まれて伸びるモーダル(画面の中央に置くので上にも動く)に
 * 注釈を付ける前に使う。
 */
export async function settle(locator, { interval = 200, timeout = 10000 } = {}) {
  let previous = null;
  for (const start = Date.now(); Date.now() - start < timeout; ) {
    const box = await locator.boundingBox();
    if (previous && box && JSON.stringify(box) === JSON.stringify(previous)) return;
    previous = box;
    await locator.page().waitForTimeout(interval);
  }
}

/** 入力欄のフォーカスを外す(カーソルやフォーカスの枠を写さない)。 */
export async function blur(page) {
  await page.evaluate(() => document.activeElement?.blur());
}

/** カルテの時系列の、ある診療日(YYYY-MM-DD)のまとまり。 */
export function dayGroup(page, day) {
  return page.locator(".karte-group").filter({ has: page.locator(".karte-group__date", { hasText: day }) });
}

/**
 * カルテのカード(cards)を、カードの「⋮」の「削除」ですべて消す。撮影の前後に、毎回同じ画面から
 * 始めるために使う。撮影用データの受診歴を消さないよう、cards は撮影日のまとまり(dayGroup)などに絞って渡す。
 * 連日の注射のように「この日以降」をまとめて消せるときは、そのボタンを押す。
 */
export async function deleteAllCards(page, cards) {
  await page.waitForLoadState("networkidle");
  for (let remaining = await cards.count(); remaining > 0; remaining = await cards.count()) {
    await cards.first().getByRole("button", { name: /の操作$/ }).click();
    await menuItem(page, "削除").click();
    const modal = page.locator(".modal").last();
    await modal.getByRole("combobox").fill("誤入力");
    await modal.getByRole("button", { name: /削除$/ }).last().click();
    await modal.waitFor({ state: "detached" });
    await cards.nth(remaining - 1).waitFor({ state: "detached" });
  }
}

/** 開いているカルテの患者 ID(URL の /patients/:id/karte から)。 */
export function patientIdOf(page) {
  const id = new URL(page.url()).pathname.match(/\/patients\/([^/]+)\/karte/)?.[1];
  if (!id) throw new Error(`カルテの URL ではありません: ${page.url()}`);
  return id;
}

/**
 * ログイン中のセッションで FHIR を直接読み書きする。画面に削除の操作が無い記録(取り消した予約など)を、
 * 撮影の前後に片付けるときだけ使う。写真に写す操作は画面で行う。
 */
export async function fhirApi(page) {
  const { csrf_token: csrf } = await (await page.request.get("/auth/session")).json();
  const ok = async (response) => {
    if (!response.ok()) throw new Error(`${response.url()}: ${response.status()} ${await response.text()}`);
    return response.status() === 204 ? null : response.json();
  };
  return {
    search: async (type, params) => {
      const bundle = await ok(await page.request.get(`/fhir/${type}?${new URLSearchParams(params)}`));
      return (bundle.entry ?? []).map((entry) => entry.resource).filter((r) => r?.resourceType === type);
    },
    read: async (reference) => ok(await page.request.get(`/fhir/${reference}`)),
    update: async (resource) =>
      ok(
        await page.request.put(`/fhir/${resource.resourceType}/${resource.id}`, {
          headers: { "Content-Type": "application/fhir+json", "X-CSRF-Token": csrf },
          data: JSON.stringify(resource),
        }),
      ),
    remove: async (type, id) =>
      ok(await page.request.delete(`/fhir/${type}/${id}`, { headers: { "X-CSRF-Token": csrf } })),
  };
}

/**
 * 患者のオーダーをまとめて消す(進捗などの Task・予約・オーダー本体)。化学療法の適用や実施済の処置のように、
 * 画面から丸ごと消せないオーダーを撮影の前後に片付けるときに使う。受診歴などのオーダーを持たない撮影用の患者
 * (見本 次郎・見本 太郎)にだけ使う(受診歴の処方を持つ見本 花子には使わない)。extra には、ほかに消す記録を
 * [型, 消すものを選ぶ関数] で渡す(実施記録の Procedure など)。
 */
export async function removeOrdersOf(page, patientId, extra = []) {
  const api = await fhirApi(page);
  const targets = [
    ["Task", () => true],
    ["Appointment", () => true],
    ...extra,
    ["MedicationRequest", () => true],
    ["ServiceRequest", () => true],
  ];
  for (const [type, match] of targets) {
    const rows = (await api.search(type, { patient: patientId, _count: "500" })).filter(match);
    for (const row of childrenFirst(rows)) {
      if (type === "Appointment") await freeSlots(api, row);
      await api.remove(type, row.id);
    }
  }
}

/** 同じ型の中で basedOn・partOf で親を指す記録を、親より先に並べる(親を先に消すと参照が残る)。 */
function childrenFirst(rows) {
  const parentOf = (row) =>
    [...(row.basedOn ?? []), ...(row.partOf ?? [])].map((r) => r.reference?.split("/").pop()).filter(Boolean);
  const depth = (row, seen = new Set()) => {
    if (seen.has(row.id)) return 0;
    seen.add(row.id);
    const parents = rows.filter((r) => parentOf(row).includes(r.id));
    return parents.length ? 1 + Math.max(...parents.map((p) => depth(p, seen))) : 0;
  };
  return [...rows].sort((a, b) => depth(b) - depth(a));
}

/** 予約を直接消す前に、予約が押さえていた枠を空きに戻す(予約を消しても枠は埋まったまま残る)。 */
async function freeSlots(api, appointment) {
  for (const { reference } of appointment.slot ?? []) {
    const slot = await api.read(reference);
    if (slot.status !== "free") await api.update({ ...slot, status: "free" });
  }
}

/** 日付(YYYY-MM-DD)に日数を足す。 */
export function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * ログアウトし、Cookie も消す(役割を替えて続けて撮るとき)。ログアウトの前に出ていた通信の応答が、あとから
 * ログイン中のセッションの Cookie を書き戻すことがあるので、開き直してログイン画面になるまで消し直す。
 */
export async function logout(page) {
  await page.waitForLoadState("networkidle");
  const loggedOut = page.waitForResponse((r) => r.url().endsWith("/auth/session") && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "ログアウト" }).click();
  await loggedOut;
  for (let i = 0; i < 5; i++) {
    await page.context().clearCookies();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    if (await page.getByLabel("ログインID").isVisible()) return;
  }
  throw new Error("ログアウトできません");
}
