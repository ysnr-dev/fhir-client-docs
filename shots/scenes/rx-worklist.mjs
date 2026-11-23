// 操作マニュアル「処方一覧」(docs/manual/rx-worklist.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)に定期処方を出し、薬剤 三郎が処方一覧で処方箋を発行して
// 調剤登録する。撮影の前後に、見本 太郎のオーダーと調剤の記録を消す。
import { blur, logout, menuItem } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  pharmacyPatientId,
  registerPrescription,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が定期処方を出す
  await login("doctor");
  await openPharmacyKarte(page);
  await registerPrescription(page, [
    {
      medicines: [{ query: "ランソプラゾールOD錠15mg「トーワ」", row: "トーワ", dose: 1 }],
      usage: "1日1回朝食後",
      usageRow: /朝食後\s+服用/,
      days: 7,
    },
    {
      medicines: [{ query: "マグミット錠330mg", row: "マグミット", dose: 3 }],
      usage: "1日3回朝昼夕食後",
      usageRow: /朝昼夕食後\s+服用/,
      days: 7,
    },
  ]);
  await logout(page);

  // 処方一覧
  await login("pharmacist");
  await openPharmacyMenu(page, "処方一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: "マグミット" });
  await row.locator(".rx-verification__mark").waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const filters = page.locator(".patient-search-form");
  const count = page.locator(".lab-worklist__count");
  await mark(filters.locator("label").filter({ hasText: "処方日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "入外区分" }), { label: 2, place: "corner" });
  await mark(row.locator(".lab-worklist__status"), { label: 3, place: "corner" });
  await mark(row.getByRole("link", { name: "処方箋発行" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "表示" }), { label: 5, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  // 処方箋一括発行
  const bulkButton = page.getByRole("button", { name: "処方箋一括発行" });
  await bulkButton.click();
  const modal = page.locator(".modal");
  const ward = modal.getByRole("row").filter({ hasText: "見本病棟" });
  await ward.waitFor();
  await ward.locator("input[type=checkbox]").check();
  await blur(page);
  await mark(modal.getByText(/^処方日/), { label: 1 });
  await mark(ward, { label: 2 });
  await mark(modal.getByRole("button", { name: "発行", exact: true }), { label: 3, place: "corner" });
  await mark(modal.getByRole("button", { name: "再発行" }), { label: 4, place: "corner" });
  await shot("02-bulk", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "キャンセル" }).click();
  await modal.waitFor({ state: "detached" });

  // 処方箋を発行する(PDF は別のタブで開くので閉じる)
  const [pdf] = await Promise.all([
    page.context().waitForEvent("page"),
    row.getByRole("link", { name: "処方箋発行" }).click(),
  ]);
  await pdf.close();
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "調剤登録" }), { label: 2, place: "corner" });
  await mark(row.getByRole("button", { name: "この処方の操作" }), { label: 3, place: "corner" });
  await shot("03-accepted", { target: row });
  await clearMarks();

  // 調剤登録
  await row.getByRole("button", { name: "調剤登録" }).click();
  await modal.locator("fieldset").filter({ hasText: "RP2" }).waitFor();
  await page.waitForLoadState("networkidle");
  const rp1 = modal.locator("fieldset").filter({ hasText: "RP1" });
  await rp1.locator("tbody input").last().fill("一包化不可");
  await blur(page);
  await mark(modal.locator(".prescription-detail__common"), { label: 1 });
  await mark(rp1.getByRole("button", { name: "変更", exact: true }), { label: 2 });
  await mark(rp1.locator(".rp-card__dose-input"), { label: 3, place: "corner" });
  await mark(rp1.locator("tbody input").last(), { label: 4, place: "corner" });
  await mark(rp1.getByRole("button", { name: "用法変更" }), { label: 5 });
  await mark(rp1.locator(".rp-card__dose-count-input"), { label: 6, place: "corner" });
  await mark(modal.getByRole("button", { name: "調剤登録" }), { label: 7 });
  await shot("04-dispense", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "調剤登録" }).click();
  await modal.waitFor({ state: "detached" });

  // 調剤済の行とメニュー
  await row.locator(".lab-worklist__status", { hasText: "調剤済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: "この処方の操作" }).click();
  const menu = page.locator(".row-menu__items").last();
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(menuItem(page, "処方箋再発行"), { label: 2 });
  await mark(menuItem(page, "取消"), { label: 3 });
  await shot("05-dispensed", { target: [row, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
