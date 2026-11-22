// 操作マニュアル「服薬指導」(docs/manual/medication-guidance.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)にハイリスク薬の服薬指導を依頼し、薬剤 三郎が服薬指導一覧で
// 受け付け、担当を決め、指導を記録して終了する。撮影の前後に、見本 太郎のオーダーと指導の記録を消す。
// 一覧には開発データの入院の指導も日付をまたいで並ぶので、病棟を見本病棟に絞って撮る。
import { blur, labeled, logout, menuItem } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  pharmacyPatientId,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";

const fieldsetOf = (page, form, legend) =>
  form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師がハイリスク薬の服薬指導を依頼する
  await login("doctor");
  await openPharmacyKarte(page);
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "服薬指導", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const guidance = fieldsetOf(page, form, "指導内容");
  await guidance.waitFor();
  await page.waitForLoadState("networkidle");
  await guidance.locator("label").filter({ hasText: "ハイリスク薬" }).locator("input").check();
  await labeled(guidance, "対象薬剤").locator("input, textarea").first().fill("ワーファリン錠1mg");
  await labeled(guidance, "指導してほしいこと").locator("textarea, input").first().fill("食事の注意と、出血したときの対応");
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await logout(page);

  // 服薬指導一覧
  await login("pharmacist");
  await openPharmacyMenu(page, "服薬指導一覧");
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: "ワーファリン" });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const count = page.locator(".lab-worklist__count");
  await blur(page);
  await mark(labeled(filters, "基準日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "病棟"), { label: 2, place: "corner" });
  await mark(labeled(filters, "担当"), { label: 3, place: "corner" });
  await mark(row.locator(".lab-worklist__status").or(row.locator("td").nth(-2)).first(), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "受付", exact: true }), { label: 5, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();
  await row.getByRole("button", { name: "受付", exact: true }).click();
  await row.getByRole("button", { name: "実施", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");

  // 担当薬剤師を決める
  await row.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__items").last();
  await mark(menuItem(page, "担当"), { label: 1 });
  await mark(menuItem(page, "終了"), { label: 2 });
  await shot("02-menu", { target: [row, menu] });
  await clearMarks();
  await menuItem(page, "担当").click();
  let modal = page.locator(".modal");
  await modal.locator("select").selectOption({ label: "薬剤 三郎" });
  await blur(page);
  await mark(modal.locator("select"), { label: 1 });
  await mark(modal.getByRole("button", { name: "登録", exact: true }), { label: 2 });
  await shot("03-assign", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "登録", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await row.filter({ hasText: "薬剤 三郎" }).waitFor();

  // 指導を記録する
  await row.getByRole("button", { name: "実施", exact: true }).click();
  modal = page.locator(".modal");
  const perform = modal.locator("form");
  await perform.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(perform, "理解度").locator("select").selectOption({ index: 1 });
  await perform.getByLabel("指導内容").fill(
    "ワルファリンの作用と服用時刻を説明した。納豆・青汁を控えること、出血したときは連絡することを説明し、理解を得た。",
  );
  await blur(page);
  await mark(labeled(perform, "実施日"), { label: 1, place: "corner" });
  await mark(labeled(perform, "指導種別"), { label: 2, place: "corner" });
  await mark(labeled(perform, "理解度"), { label: 3, place: "corner" });
  await mark(labeled(perform, "担当薬剤師"), { label: 4, place: "corner" });
  await mark(perform.getByLabel("指導内容"), { label: 5 });
  await mark(perform.getByRole("button", { name: "テンプレート" }), { label: 6, place: "corner" });
  await mark(perform.getByRole("button", { name: "実施登録" }), { label: 7 });
  await shot("04-perform", { target: modal, padding: 40 });
  await clearMarks();
  await perform.getByRole("button", { name: "実施登録" }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await mark(row.locator("td").nth(-7), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(-6), { label: 2, place: "corner" });
  await shot("05-performed", { target: row });
  await clearMarks();

  // 終了する
  await row.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "終了").click();
  modal = page.locator(".modal");
  await modal.getByLabel("終了日").waitFor();
  await blur(page);
  await mark(modal.getByLabel("終了日"), { label: 1 });
  await mark(modal.getByRole("button", { name: "終了", exact: true }), { label: 2 });
  await shot("06-finish", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "終了", exact: true }).click();
  await modal.waitFor({ state: "detached" });

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
