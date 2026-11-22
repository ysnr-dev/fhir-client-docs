// データの部(データ抽出・分析ダッシュボード・患者フォルダ)のシーンで共通に使う条件の組み立てと片付け。
// 保存した条件・ダッシュボード・フォルダは fhir-client の backend(/master/*)に持つので、片付けはその API で消す。
// 抽出の条件は撮影用の患者だけが当たるように組む(開発データには実在の人名の患者がいる)。
import { labeled, pickRow } from "./karte.mjs";

/** 患者タブの見本の条件。高血圧症で、直近 60 日にアムロジピンを処方した患者(撮影用データでは見本 花子だけ)。 */
export const HYPERTENSION_QUERY = "高血圧症でアムロジピン処方中";
/** 入院・外来タブの見本の条件。直近 30 日に見本病棟に入院していた入院(見本 太郎・見本 秋子)。 */
export const WARD_QUERY = "見本病棟の入院(30日)";
const AMLODIPINE_5MG = "620007818";
const SHOOTING_WARD = "見本病棟";

/** backend の /master/* を読み書きする(撮影の前後の片付けだけに使う)。 */
export async function masterApi(page) {
  const { csrf_token: csrf } = await (await page.request.get("/auth/session")).json();
  const ok = async (response) => {
    if (!response.ok()) throw new Error(`${response.url()}: ${response.status()} ${await response.text()}`);
    return response.status() === 204 ? null : response.json();
  };
  return {
    get: async (path, params = {}) => ok(await page.request.get(`/master/${path}?${new URLSearchParams(params)}`)),
    remove: async (path, id) => ok(await page.request.delete(`/master/${path}/${id}`, { headers: { "X-CSRF-Token": csrf } })),
  };
}

/** ログイン中の職員が自分の持ち物として保存した、名前が names のデータ抽出の条件を消す。 */
export async function removeQueries(page, names) {
  const api = await masterApi(page);
  const practitionerId = await currentPractitionerId(page);
  const { items } = await api.get("extract_queries", { practitioner_id: practitionerId });
  for (const query of items.filter((q) => q.scope === "practitioner" && names.includes(q.name))) {
    await api.remove("extract_queries", query.id);
  }
}

/** ログイン中の職員が自分の持ち物として保存した、名前が names の分析ダッシュボードを消す。 */
export async function removeDashboards(page, names) {
  const api = await masterApi(page);
  const { items } = await api.get("dashboards", { practitioner_id: await currentPractitionerId(page) });
  for (const dashboard of items.filter((d) => d.scope === "practitioner" && names.includes(d.name))) {
    await api.remove("dashboards", dashboard.id);
  }
}

/** ログイン中の職員の自分のフォルダのうち、名前が names のフォルダを下位フォルダ・中の患者ごと消す。 */
export async function removeOwnFolders(page, names) {
  const api = await masterApi(page);
  const practitionerId = await currentPractitionerId(page);
  const { items } = await api.get("patient_folders", { practitioner_id: practitionerId });
  const own = items.filter((f) => f.scope === "practitioner");
  const targets = new Set(own.filter((f) => names.includes(f.name) && f.parent_id === null).map((f) => f.id));
  for (let added = true; added; ) {
    added = false;
    for (const f of own) {
      if (!targets.has(f.id) && targets.has(f.parent_id)) {
        targets.add(f.id);
        added = true;
      }
    }
  }
  // 子フォルダが残るフォルダは消せないので、深いものから消す。
  const depth = (f) => (f.parent_id === null ? 0 : 1 + depth(own.find((p) => p.id === f.parent_id)));
  for (const folder of own.filter((f) => targets.has(f.id)).sort((a, b) => depth(b) - depth(a))) {
    await api.remove("patient_folders", folder.id);
  }
}

/** ログイン中の職員の Practitioner の id。 */
export async function currentPractitionerId(page) {
  const session = await (await page.request.get("/auth/session")).json();
  const id = session.user?.practitioner_id;
  if (!id) throw new Error(`ログイン中の職員が分かりません: ${JSON.stringify(session)}`);
  return id;
}

/** 条件の木の「＋条件」で種類を選んで足し、足した条件の枠を返す。 */
export async function addCondition(page, kind) {
  const leaves = page.locator(".extract-leaf");
  const before = await leaves.count();
  await page.locator("select").filter({ has: page.locator("option", { hasText: "＋条件" }) }).first().selectOption({ label: kind });
  await leaves.nth(before).waitFor();
  return leaves.nth(before);
}

/** 「患者」タブに、高血圧症 × アムロジピン(直近 60 日)の条件を組む。 */
export async function buildHypertensionQuery(page) {
  await page.goto("/data-extract");
  const condition = await addCondition(page, "病名");
  await labeled(condition, "表示名").locator("input").fill("高血圧症");
  await condition.getByRole("button", { name: "病名", exact: true }).click();
  const diseaseModal = page.locator(".modal").filter({ hasText: "病名を選択" });
  await labeled(diseaseModal, "病名").locator("input").fill("高血圧症");
  const diseaseRow = diseaseModal.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^高血圧症$/ }) }).first();
  await diseaseRow.waitFor();
  await diseaseRow.click();
  await diseaseModal.waitFor({ state: "detached" });

  const medication = await addCondition(page, "処方・注射");
  await labeled(medication, "表示名").locator("input").fill("アムロジピン");
  await medication.getByRole("button", { name: "薬剤", exact: true }).click();
  const drugModal = page.locator(".modal").filter({ hasText: "医薬品を選択" });
  await labeled(drugModal, "医薬品名").locator("input").fill("アムロジピン");
  const drugRow = drugModal.getByRole("row").filter({ hasText: AMLODIPINE_5MG });
  await drugRow.waitFor();
  await pickRow(drugRow);
  await drugModal.waitFor({ state: "detached" });
  await medication.locator("input[aria-label=日数]").fill("60");
  return { condition, medication };
}

/** 「入院・外来」タブに、直近 30 日に見本病棟に入院していた入院の条件を組む。 */
export async function buildWardQuery(page) {
  await page.goto("/data-extract?tab=encounter");
  const ward = labeled(page.locator(".page"), "病棟").locator("select");
  await ward.locator("option", { hasText: SHOOTING_WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: SHOOTING_WARD });
  await page.locator("input[aria-label=日数]").first().fill("30");
}

/** 組んだ条件を「保存」で自分の条件として保存する。 */
export async function saveQuery(page, name) {
  await page.getByRole("button", { name: "保存", exact: true }).first().click();
  const modal = page.locator(".modal").filter({ hasText: "条件を保存" });
  await labeled(modal, "名前").locator("input").fill(name);
  await modal.getByRole("button", { name: "保存", exact: true }).click();
  await modal.waitFor({ state: "detached" });
}
