// 操作マニュアル「処方監査」(docs/manual/rx-verification.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)に処方と注射を出し、薬剤 三郎が処方監査で監査する。
// 撮影の前後に、見本 太郎のオーダーと監査の記録を消す。
import { blur, logout } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  pharmacyPatientId,
  registerInjection,
  registerPrescription,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が処方と注射を出す
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
  await registerInjection(page, {
    medicines: [{ query: "セファゾリンNa点滴静注用1gバッグ", row: "ＮＰ", dose: 1 }],
    time: "10:00",
  });
  await logout(page);

  await login("pharmacist");

  // 処方一覧の監査の印
  await openPharmacyMenu(page, "処方一覧");
  const worklistRow = page.locator(".lab-worklist tbody tr").filter({ hasText: "マグミット" });
  await worklistRow.locator(".rx-verification__mark", { hasText: "未監査" }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await mark(worklistRow.locator(".rx-verification__mark"), { label: 1, place: "corner" });
  await mark(worklistRow.getByRole("button", { name: "監査", exact: true }), { label: 2, place: "corner" });
  await shot("06-worklist", { target: worklistRow });
  await clearMarks();

  // 処方監査を開く
  const menu = page.locator(".app__header .hover-menu").filter({ hasText: "部門業務" });
  await menu.locator(".hover-menu__trigger").hover();
  const group = menu.locator(".sub-menu").filter({ hasText: "薬剤部門" });
  await group.hover();
  const link = menu.locator(".sub-menu__items").getByRole("link", { name: "処方監査", exact: true });
  await mark(menu.locator(".hover-menu__trigger"), { label: 1 });
  await mark(group.locator(".sub-menu__trigger"), { label: 2 });
  await mark(link, { label: 3, place: "corner" });
  await shot("01-menu", {
    target: [menu.locator(".hover-menu__trigger"), menu.locator(".hover-menu__items"), menu.locator(".sub-menu__items")],
    padding: 40,
  });
  await clearMarks();
  await link.click();
  await page.mouse.move(960, 1000);

  // 未監査の一覧
  const count = page.locator(".lab-worklist__count");
  await count.filter({ hasText: "2 件" }).waitFor();
  await page.waitForLoadState("networkidle");
  const rows = page.locator(".lab-worklist tbody tr");
  await assertOnlyShootingPatients(rows);
  const rxRow = rows.filter({ hasText: "マグミット" });
  const injectionRow = rows.filter({ hasText: "セファゾリン" });
  await mark(page.getByRole("tab", { name: "未監査" }), { label: 1 });
  await mark(page.locator(".patient-search-form"), { label: 2 });
  await mark(rxRow.locator("td").nth(5), { label: 3, place: "corner" });
  await mark(rxRow.getByRole("button", { name: "監査", exact: true }), { label: 4, place: "corner" });
  await mark(injectionRow.getByRole("button", { name: "疑義照会" }), { label: 5, place: "corner" });
  await shot("02-list", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  // 監査の画面: 患者の状態と処方の内容
  await rxRow.getByRole("button", { name: "監査", exact: true }).click();
  const modal = page.locator(".modal");
  const result = modal.locator(".rx-verification__result");
  await modal.locator(".prescription-detail, fieldset.rp-card, .rp-card").first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(modal.locator(".rx-verification__patient"), { label: 1 });
  await mark(modal.locator("fieldset").filter({ hasText: "RP1" }).first(), { label: 2 });
  await shot("03-detail", { target: modal });
  await clearMarks();

  // 監査結果を入れる(介入あり)
  await result.getByText("介入あり", { exact: true }).click();
  await result.getByText("用法・投与経路", { exact: true }).click();
  await result.getByLabel("介入内容").fill("ランソプラゾールOD錠は水なしで服用できることを病棟へ情報提供した。");
  await result.getByLabel("処方医の対応").selectOption({ label: "変更なし" });
  await blur(page);
  const actions = modal.locator(".rx-inquiry-form__actions");
  await actions.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(result.locator(".rx-inquiry-form__choices").first(), { label: 1 });
  await mark(result.locator(".rx-verification__field").first(), { label: 2 });
  await mark(result.getByLabel("介入内容"), { label: 3 });
  await mark(result.getByLabel("処方医の対応"), { label: 4 });
  await mark(actions.getByRole("button", { name: "監査済" }), { label: 5 });
  await mark(actions.getByRole("button", { name: "疑義照会" }), { label: 6, place: "corner" });
  await shot("04-result", { target: [result, actions], padding: 40 });
  await clearMarks();
  await actions.getByRole("button", { name: "監査済" }).click();
  await modal.waitFor({ state: "detached" });
  await count.filter({ hasText: "1 件" }).waitFor();

  // 注射は問題なしで監査済にする
  await injectionRow.getByRole("button", { name: "監査", exact: true }).click();
  await modal.locator(".rx-verification__result").waitFor();
  await page.waitForLoadState("networkidle");
  await modal.locator(".rx-verification__result").getByText("問題なし", { exact: true }).click();
  await modal.getByRole("button", { name: "監査済" }).click();
  await modal.waitFor({ state: "detached" });
  await count.filter({ hasText: "0 件" }).waitFor();

  // 監査済の一覧
  await page.getByRole("tab", { name: "監査済" }).click();
  await count.filter({ hasText: "2 件" }).waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const verifiedRx = rows.filter({ hasText: "マグミット" });
  await mark(page.getByRole("tab", { name: "監査済" }), { label: 1, place: "corner" });
  await mark(page.locator(".patient-search-form label").filter({ hasText: "監査日" }), { label: 2, place: "corner" });
  await mark(verifiedRx.locator("td").nth(-3), { label: 3, place: "corner" });
  await mark(verifiedRx.getByRole("button", { name: "表示" }), { label: 4, place: "corner" });
  await shot("05-verified", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
