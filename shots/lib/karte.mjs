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

/** 日付(YYYY-MM-DD)に日数を足す。 */
export function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
