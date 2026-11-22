// 操作マニュアル「持参薬鑑別」(docs/manual/brought-medication.md)
// 入院中の「見本 太郎」(撮影用の架空の患者)の持参薬を看護 次郎がカルテに登録し、薬剤 三郎が持参薬鑑別一覧で鑑別し、
// 医師 四郎が続けるかどうかを決める。撮影の前後に、見本 太郎の持参薬・オーダーと鑑別依頼を消す。
import { blur, labeled, logout, openKarte, patientIdOf, pickRow } from "../lib/karte.mjs";
import { openPharmacyMenu, PHARMACY_PATIENT, pharmacyPatientId, removePharmacyRecords } from "../lib/pharmacy.mjs";

const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

/** 患者情報の「持参薬」タブを開く。 */
async function openTab(page) {
  await page.locator(".karte-tabs__list").getByRole("tab", { name: /患者情報/ }).hover();
  await page.locator(".karte-tabs__menu").getByText("持参薬", { exact: true }).click();
  await page.mouse.move(1500, 700);
  await page.waitForLoadState("networkidle");
}

/** 医薬品・用法の検索モーダルで 1 行選ぶ。鑑別の画面の中では入れ子で開くので、モーダルの数が減るまで待つ。 */
async function pick(page, query, rowText) {
  const modal = page.locator(".modal").last();
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill(query);
  const row = modal.getByRole("row").filter({ hasText: rowText }).first();
  await row.waitFor();
  const opened = await page.locator(".modal").count();
  await pickRow(row);
  await page.waitForFunction((n) => document.querySelectorAll(".modal").length < n, opened);
}

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 看護師が持参薬を登録する
  await login("nurse");
  await openKarte(page, PHARMACY_PATIENT);
  await removePharmacyRecords(page, patientIdOf(page));
  await page.reload();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");

  const tabs = page.locator(".karte-tabs__list");
  await tabs.getByRole("tab", { name: /患者情報/ }).hover();
  const tabMenu = page.locator(".karte-tabs__menu");
  await tabMenu.waitFor();
  await mark(tabMenu.getByText("持参薬", { exact: true }), { label: 1 });
  await shot("01-tab", { target: [tabs, tabMenu], padding: 24 });
  await clearMarks();
  await openTab(page);

  const left = page.locator(".karte-left");
  await left.getByRole("button", { name: "新規登録" }).click();
  const form = left.locator("form.prescription-form");
  await form.waitFor();
  const hearing = form.locator("fieldset").first();
  await labeled(hearing, "情報源").locator("select").selectOption({ label: "お薬手帳" });
  await labeled(hearing, "処方元").locator("input").fill("見本内科クリニック");
  await labeled(hearing, "最終服用日時").locator("input").fill("2027-01-28T08:00");

  // 1 剤目: マスタから選ぶ
  const first = form.locator("fieldset.rp-card").nth(0);
  await first.getByRole("button", { name: "マスタから選択" }).first().click();
  await pick(page, "アムロジピン錠5mg「あすか」", "あすか");
  await first.getByRole("button", { name: "マスタから選択" }).last().click();
  await pick(page, "1日1回朝食後", /朝食後\s+服用/);
  await labeled(first, "1 回量").locator("input").fill("1");
  await labeled(first, "持参数").locator("input").fill("10");

  // 2 剤目: 名前と用法を文字で入れる
  await form.getByRole("button", { name: "+ 持参薬追加" }).click();
  const second = form.locator("fieldset.rp-card").nth(1);
  await second.getByLabel("薬剤名").fill("ファモチジン錠(規格不明)");
  await second.getByLabel("用法").fill("1日2回 朝夕食後");
  await labeled(second, "1 回量").locator("input").fill("1");
  await labeled(second, "持参数").locator("input").fill("14");
  await blur(page);
  await form.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(hearing, { label: 1 });
  await mark(first.locator(".rp-card__usage").nth(0), { label: 2 });
  await mark(first.locator(".rp-card__usage").nth(1), { label: 3 });
  await mark(labeled(first, "1 回量"), { label: 4, place: "corner" });
  await mark(labeled(first, "持参数"), { label: 5, place: "corner" });
  await mark(labeled(first, "コメント"), { label: 6, place: "corner" });
  await shot("02-form", { target: [hearing, first], padding: 40 });
  await clearMarks();

  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(second.getByLabel("薬剤名"), { label: 1, place: "corner" });
  await mark(second.getByLabel("用法"), { label: 2, place: "corner" });
  await mark(form.getByRole("button", { name: "+ 持参薬追加" }), { label: 3 });
  await mark(submit, { label: 4 });
  await shot("03-form-text", { target: [second, submit], padding: 40 });
  await clearMarks();
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  const table = left.locator("table");
  await table.getByRole("row").filter({ hasText: "ファモチジン" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(table.locator("tbody tr").first().locator("td").nth(-2), { label: 1, place: "corner" });
  await shot("04-registered", { target: [left.locator(".karte-tabpanel__header"), table], padding: 24 });
  await clearMarks();
  await logout(page);

  // 薬剤師が鑑別する
  await login("pharmacist");
  await openPharmacyMenu(page, "持参薬鑑別一覧");
  const row = page.locator(".lab-worklist tbody tr").filter({ hasText: PHARMACY_PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator("td").nth(-3), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "鑑別開始" }), { label: 2, place: "corner" });
  await shot("05-worklist", { target: [page.locator(".page__header"), page.locator(".lab-worklist")], padding: 24 });
  await clearMarks();
  await row.getByRole("button", { name: "鑑別開始" }).click();
  await row.getByRole("button", { name: "鑑別", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "鑑別", exact: true }).click();

  const modal = page.locator(".modal").first();
  const amlodipine = modal.locator("fieldset.rp-card").filter({ hasText: "アムロジピン" });
  const famotidine = modal.locator("fieldset.rp-card").filter({ hasText: "ファモチジン" });
  await famotidine.waitFor();
  await labeled(amlodipine, "残日数").locator("input").fill("10");
  await labeled(amlodipine, "院内での扱い").locator("select").selectOption({ label: "同じ薬が院内にある" });
  await famotidine.getByRole("button", { name: "選択", exact: true }).click();
  await pick(page, "ファモチジン錠10mg", "ファモチジン錠１０ｍｇ「ＴＣＫ」");
  await labeled(famotidine, "残日数").locator("input").fill("7");
  await labeled(famotidine, "院内での扱い").locator("select").selectOption({ label: "持参分を使う" });
  await labeled(famotidine, "コメント").locator("input").fill("お薬手帳で10mgと確認");
  await blur(page);
  await famotidine.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(famotidine.locator("legend"), { label: 1, place: "corner" });
  await mark(famotidine.locator(".brought-med__check"), { label: 2 });
  await mark(famotidine.locator(".rp-card__usage").first(), { label: 3 });
  await mark(famotidine.locator(".rp-card__usage-row").last(), { label: 4 });
  await mark(labeled(famotidine, "院内での扱い"), { label: 5 });
  await mark(labeled(famotidine, "コメント"), { label: 6 });
  await mark(modal.getByRole("button", { name: "保存" }), { label: 7, place: "corner" });
  await shot("06-identify", { target: [famotidine, modal.locator(".brought-med__actions")], padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "保存" }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  const complete = row.getByRole("button", { name: "鑑別完了" });
  await mark(row.locator("td").nth(-2), { label: 1, place: "corner" });
  await mark(complete, { label: 2, place: "corner" });
  await shot("07-complete", { target: row });
  await clearMarks();
  await complete.click();
  await row.waitFor({ state: "detached" });
  await logout(page);

  // 医師が続けるかどうかを決める
  await login("doctor");
  await openKarte(page, PHARMACY_PATIENT);
  await page.waitForLoadState("networkidle");
  await openTab(page);
  const doctorTable = left.locator("table");
  const amlodipineRow = doctorTable.locator("tbody tr").filter({ hasText: "アムロジピン" });
  await amlodipineRow.waitFor();
  await amlodipineRow.getByRole("checkbox").check();
  await mark(doctorTable.locator("tbody tr").first().locator("td").nth(-2), { label: 1, place: "corner" });
  await mark(amlodipineRow.getByRole("checkbox"), { label: 2 });
  const decisions = left.locator(".brought-med__bulk");
  await mark(decisions, { label: 3 });
  await shot("08-decide", { target: [left.locator(".karte-tabpanel__header"), doctorTable], padding: 24 });
  await clearMarks();

  // 継続: 処方(区分「持参」)を起こす
  await decisions.getByRole("button", { name: "継続(院内処方)" }).click();
  const rxForm = page.locator(".prescription-form").filter({ hasText: "処方共通" });
  await rxForm.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const common = rxForm.locator("fieldset").first();
  await mark(labeled(common, "処方区分"), { label: 1, place: "corner" });
  await mark(rxForm.locator(".rp-card__dose-count-input").first(), { label: 2, place: "corner" });
  await mark(rxForm.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }), { label: 3 });
  await shot("09-continue", { target: rxForm, padding: 40 });
  await clearMarks();
  await rxForm.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await rxForm.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
