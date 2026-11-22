// 操作マニュアル「抗菌薬適正使用」(docs/manual/ast.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)に特定抗菌薬(許可制)のバンコマイシンを 7 日間出し、
// 薬剤 三郎が抗菌薬適正使用の一覧で使用中・届出・集計を見る。集計は見本 秋子(看護の写真用)の抗菌薬の点滴がある
// 撮影日の前の月を見本病棟に絞って撮る。撮影の前後に、見本 太郎のオーダーと届出の通知を消す。
import { addDays, blur, labeled, logout, pickRow } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  pharmacyPatientId,
  removePharmacyRecords,
  submitOrderForm,
} from "../lib/pharmacy.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が特定抗菌薬の注射を出す
  await login("doctor");
  await openPharmacyKarte(page);
  await page.locator(".karte-right").getByRole("button", { name: "注射", exact: true }).click();
  const form = page.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await labeled(common, "注射区分").locator("select").selectOption({ label: "定時" });
  await labeled(common, "終了日").locator("input").fill(addDays(SHOOTING_DATE, 6));
  const rp = form.locator("fieldset.rp-card").first();
  await rp.getByRole("button", { name: "医薬品を選択" }).click();
  const modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill("バンコマイシン塩酸塩点滴静注用0.5g「NIG」");
  const row = modal.getByRole("row").filter({ hasText: "ＮＩＧ" }).first();
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
  await rp.locator(".rp-card__dose-input").first().fill("2");
  const times = rp.locator(".injection-start-times");
  await times.getByRole("button", { name: "+ 開始時刻追加" }).click();
  await times.getByLabel("1 回目の開始時刻").fill("10:00");
  await blur(page);
  const warning = rp.getByText("特定抗菌薬(許可制)");
  await warning.waitFor();
  await mark(warning, { label: 1 });
  await shot("01-warning", { target: rp.locator(".rp-card__medicines"), padding: 40 });
  await clearMarks();
  await submitOrderForm(page, form);
  await logout(page);

  // 使用中
  await login("pharmacist");
  await openPharmacyMenu(page, "抗菌薬適正使用");
  const rows = page.locator(".lab-worklist tbody tr");
  const usage = rows.filter({ hasText: "バンコマイシン" });
  await usage.waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const tabs = page.locator(".order-select__tabs");
  const count = page.locator(".lab-worklist__count");
  await mark(tabs, { label: 1 });
  await mark(usage.locator("td").nth(4), { label: 2, place: "corner" });
  await mark(usage.locator("td").nth(6), { label: 3, place: "corner" });
  await mark(usage.locator("td").nth(7), { label: 4, place: "corner" });
  await mark(usage.getByRole("button", { name: "チーム依頼" }), { label: 5, place: "corner" });
  await shot("02-usage", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  // 届出
  await tabs.getByRole("tab", { name: "届出" }).or(tabs.getByRole("button", { name: "届出" })).first().click();
  const notify = rows.filter({ hasText: "バンコマイシン" }).filter({ has: page.getByRole("button", { name: "届出書" }) });
  await notify.waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await assertOnlyShootingPatients(rows);
  await mark(notify.locator("td").nth(-2), { label: 1, place: "corner" });
  await mark(notify.getByRole("button", { name: "届出書" }), { label: 2, place: "corner" });
  await shot("03-notify", { target: [page.locator(".page__header"), page.locator(".lab-worklist")], padding: 24 });
  await clearMarks();

  // 集計
  await tabs.getByRole("tab", { name: "集計" }).or(tabs.getByRole("button", { name: "集計" })).first().click();
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "月").locator("input").fill(addDays(SHOOTING_DATE, -1).slice(0, 7));
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  const table = page.locator(".stat-table").last();
  await table.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(labeled(filters, "月"), { label: 1, place: "corner" });
  await mark(labeled(filters, "病棟"), { label: 2, place: "corner" });
  await mark(filters.getByRole("button", { name: "CSV" }), { label: 3, place: "corner" });
  await shot("04-summary", { target: [page.locator(".page__header"), table], padding: 24 });
  await clearMarks();

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
