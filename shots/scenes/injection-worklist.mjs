// 操作マニュアル「注射一覧と払出」(docs/manual/injection-worklist.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)に今日から 3 日間の点滴を出し、薬剤 三郎が注射一覧で
// 注射箋を発行して払い出す。撮影の前後に、見本 太郎のオーダーと払出の記録を消す。
// 一覧には見本 秋子(看護の写真用)の注射も並ぶ。見本 秋子の行は操作しない(看護の写真の前提が変わる)。
import { addDays, blur, logout, menuItem } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  pharmacyPatientId,
  registerInjection,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が連日の点滴を出す
  await login("doctor");
  await openPharmacyKarte(page);
  await registerInjection(page, {
    medicines: [
      { query: "ソルデム3A輸液 500mL", row: "ソルデム３Ａ輸液　５００ｍＬ", dose: 1 },
      { query: "アドナ注(静脈用)50mg", row: "アドナ注（静脈用）５０ｍｇ", dose: 1 },
    ],
    time: "10:00",
    endDate: addDays(SHOOTING_DATE, 2),
  });
  await logout(page);

  // 注射一覧
  await login("pharmacist");
  await openPharmacyMenu(page, "注射一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: "ソルデム" });
  await row.locator(".rx-verification__mark").waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const filters = page.locator(".patient-search-form");
  const count = page.locator(".lab-worklist__count");
  await mark(filters.locator("label").filter({ hasText: "注射日" }), { label: 1, place: "corner" });
  await mark(filters.locator("label").filter({ hasText: "化学療法のみ" }), { label: 2, place: "corner" });
  await mark(row.locator(".lab-worklist__status"), { label: 3, place: "corner" });
  await mark(row.getByRole("link", { name: "注射箋発行" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "表示" }), { label: 5, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  // 注射箋を発行する(注射箋と注射ラベルが別のタブで開く)
  const [print] = await Promise.all([
    page.context().waitForEvent("page"),
    row.getByRole("link", { name: "注射箋発行" }).click(),
  ]);
  const printUrl = print.url();
  await print.close();
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");

  // 注射箋と注射ラベルは画面の高さいっぱいに広がり下が空くので、撮るあいだだけ画面の高さを詰める。
  await page.setViewportSize({ width: 1920, height: 640 });
  await page.goto(printUrl);
  await page.locator(".injection-print__panel").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await mark(page.locator(".injection-print__panel--order"), { label: 1, place: "corner" });
  await mark(page.locator(".injection-print__panel--label"), { label: 2, place: "corner" });
  await shot("02-print");
  await clearMarks();
  await page.setViewportSize({ width: 1920, height: 1080 });

  // 受付済の行とメニュー(印刷のページにはヘッダーが無いので、一覧へは URL で戻る)
  await page.goBack();
  await row.locator(".lab-worklist__status", { hasText: "受付済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: /操作/ }).click();
  const menu = page.locator(".row-menu__items").last();
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "払出登録" }), { label: 2, place: "corner" });
  await mark(row.getByRole("button", { name: /操作/ }), { label: 3, place: "corner" });
  await shot("03-accepted", { target: [row, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 払出登録
  await row.getByRole("button", { name: "払出登録" }).click();
  const modal = page.locator(".modal");
  await modal.locator("fieldset").filter({ hasText: "RP1" }).waitFor();
  await page.waitForLoadState("networkidle");
  const rp = modal.locator("fieldset").filter({ hasText: "RP1" });
  await blur(page);
  await mark(modal.locator(".prescription-detail__common"), { label: 1 });
  await mark(rp.getByRole("button", { name: "変更", exact: true }).first(), { label: 2 });
  await mark(rp.locator("tbody input").first(), { label: 3, place: "corner" });
  await mark(modal.getByRole("button", { name: "払出登録" }), { label: 4 });
  await shot("04-dispense", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "払出登録" }).click();
  await modal.waitFor({ state: "detached" });

  // 払出済
  await row.locator(".lab-worklist__status", { hasText: "払出済" }).waitFor();
  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: /操作/ }).click();
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(menuItem(page, "払出取消"), { label: 2 });
  await shot("05-dispensed", { target: [row, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
