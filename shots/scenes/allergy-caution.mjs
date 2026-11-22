// 操作マニュアル「アレルギー・注意」(docs/manual/allergy-caution.md)
// 外来の「見本 花子」(撮影用データに薬剤アレルギーのロキソプロフェンがある)に、食物アレルギー「鶏卵」と注意「転倒リスク」を登録する。
// 撮影の前後に、撮影用データ以外のアレルギーと注意を消す(注意は画面から削除できないので、直接消す)。
import { blur, fhirApi, labeled, menuItem, openKarte, patientIdOf, pickRow } from "../lib/karte.mjs";

const PATIENT = "見本 花子";
const KEEP_ALLERGY = "ロキソプロフェン";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  await cleanUp(page, patientId);
  await page.reload();
  await page.locator(".karte-card").first().waitFor();
  await page.waitForLoadState("networkidle");

  // アレルギータブを開く
  const left = page.locator(".karte-left");
  const tabs = page.locator(".karte-tabs__list");
  await tabs.getByRole("tab", { name: /患者情報/ }).hover();
  const tabMenu = page.locator(".karte-tabs__menu");
  await tabMenu.waitFor();
  await mark(tabMenu.getByText("アレルギー", { exact: true }), { label: 1 });
  await shot("01-tab", { target: [tabs, tabMenu], padding: 24 });
  await clearMarks();
  await tabMenu.getByText("アレルギー", { exact: true }).click();
  await page.mouse.move(1500, 700);
  const create = left.getByRole("button", { name: "新規登録" });
  const table = left.locator("table");
  await table.waitFor();
  await mark(create, { label: 1 });
  await shot("02-list", { target: [create, table], padding: 24 });
  await clearMarks();
  await create.click();

  // アレルゲンを選ぶ
  await left.getByRole("button", { name: "アレルゲン選択" }).click();
  let modal = page.locator(".modal").filter({ hasText: "アレルゲンを選択" });
  await modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)").fill("鶏卵");
  const allergenRow = modal.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^鶏卵/ }) }).first();
  await allergenRow.waitFor();
  await blur(page);
  await mark(modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)"), { label: 1 });
  await mark(allergenRow, { label: 2 });
  await shot("03-allergen", { target: modal });
  await clearMarks();
  await pickRow(allergenRow);
  await modal.waitFor({ state: "detached" });

  // 詳細を入れて登録する
  await labeled(left, "重篤化リスク").locator("select").selectOption({ label: "高" });
  await labeled(left, "発症日").locator("input").fill("2020-05-01");
  await labeled(left, "症状").locator("input, textarea").first().fill("蕁麻疹、口唇の腫れ");
  await blur(page);
  const submit = left.getByRole("button", { name: "登録", exact: true });
  await mark(left.locator(".clinical-note-form__mode").first(), { label: 1, place: "corner" });
  await mark(left.getByRole("button", { name: "アレルゲン変更" }).or(left.getByRole("button", { name: "アレルゲン選択" })), { label: 2, place: "corner" });
  await mark(labeled(left, "タイプ"), { label: 3, place: "corner" });
  await mark(labeled(left, "重篤化リスク"), { label: 4, place: "corner" });
  await mark(labeled(left, "臨床状態"), { label: 5, place: "corner" });
  await mark(labeled(left, "確からしさ"), { label: 6, place: "corner" });
  await mark(labeled(left, "発症日"), { label: 7, place: "corner" });
  await mark(submit, { label: 8, place: "corner" });
  await shot("04-form", { target: [left.getByRole("button", { name: "← 一覧に戻る" }), submit], padding: 24 });
  await clearMarks();
  await submit.click();
  const row = table.getByRole("row").filter({ hasText: "鶏卵" });
  await row.waitFor();
  await row.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(row.getByRole("button", { name: "表示" }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("05-registered", { target: [table, menu], padding: 16 });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 診療上の注意
  await tabs.getByRole("tab", { name: /患者情報/ }).hover();
  await tabMenu.getByText("プロファイル", { exact: true }).click();
  await page.mouse.move(1500, 700);
  const sub = left.getByText("診療上の注意", { exact: true }).first();
  await sub.click();
  const flagCreate = left.getByRole("button", { name: "新規登録" });
  await flagCreate.waitFor();
  await mark(sub, { label: 1, place: "corner" });
  await mark(flagCreate, { label: 2 });
  await shot("06-caution-tab", { target: [sub, flagCreate], padding: 24 });
  await clearMarks();
  await flagCreate.click();
  await labeled(left, "区分").locator("select").selectOption({ label: "安全" });
  await labeled(left, "注意").locator("select").selectOption({ label: "転倒リスク" });
  await labeled(left, "内容").locator("textarea").fill("夜間のトイレ歩行でふらつきあり。");
  await blur(page);
  const flagSubmit = left.getByRole("button", { name: "登録", exact: true });
  await mark(labeled(left, "区分"), { label: 1, place: "corner" });
  await mark(labeled(left, "注意"), { label: 2, place: "corner" });
  await mark(labeled(left, "内容"), { label: 3, place: "corner" });
  await mark(labeled(left, "開始日"), { label: 4, place: "corner" });
  await mark(labeled(left, "終了日"), { label: 5, place: "corner" });
  await mark(flagSubmit, { label: 6, place: "corner" });
  await shot("07-caution-form", { target: [left.getByRole("button", { name: "← 一覧に戻る" }), flagSubmit, labeled(left, "内容")], padding: 24 });
  await clearMarks();
  await flagSubmit.click();
  await left.getByText("夜間のトイレ歩行でふらつきあり。").waitFor();

  // 患者の情報の印
  const header = page.locator(".karte-page__header");
  const badges = header.locator(".patient-header__cautions button");
  await badges.nth(2).waitFor();
  await badges.first().click();
  const popover = header.locator(".patient-header__popover-list").locator("..");
  await popover.first().waitFor();
  const cautions = header.locator(".patient-header__cautions");
  await mark(badges.first(), { label: 1, place: "corner" });
  await mark(header.getByRole("link", { name: "プロファイルを開く" }), { label: 2 });
  await shot("08-header", { target: [header.getByText("性別").first(), cautions.last(), popover.first()], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cleanUp(page, patientId);
}

/** 撮影用データのアレルギー以外のアレルギーと、すべての注意を消す。 */
async function cleanUp(page, patientId) {
  const api = await fhirApi(page);
  for (const allergy of await api.search("AllergyIntolerance", { patient: patientId, _count: "100" })) {
    const name = allergy.code?.text ?? allergy.code?.coding?.[0]?.display ?? "";
    if (!name.includes(KEEP_ALLERGY)) await api.remove("AllergyIntolerance", allergy.id);
  }
  for (const flag of await api.search("Flag", { patient: patientId, _count: "100" })) {
    await api.remove("Flag", flag.id);
  }
}
