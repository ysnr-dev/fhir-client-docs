// 操作マニュアル「疑義照会」(docs/manual/rx-inquiry.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)に処方を出し、薬剤 三郎が処方一覧から疑義照会を送り、
// 医師 四郎がカルテから回答し、薬剤 三郎が回答を確かめる。撮影の前後に、見本 太郎のオーダーと照会の記録を消す。
import { blur, dayGroup, logout, menuItem, openKarte } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  PHARMACY_PATIENT,
  pharmacyPatientId,
  registerPrescription,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const QUESTION = "高齢のため、酸化マグネシウムは1日2錠からの開始でよいかご確認ください。";
const ANSWER = "腎機能に問題はないため、処方どおりでお願いします。";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 医師が処方を出す
  await login("doctor");
  await openPharmacyKarte(page);
  await registerPrescription(page, [
    {
      medicines: [{ query: "マグミット錠330mg", row: "マグミット", dose: 3 }],
      usage: "1日3回朝昼夕食後",
      usageRow: /朝昼夕食後\s+服用/,
      days: 7,
    },
  ]);
  await logout(page);

  // 薬剤師が処方一覧から照会する
  await login("pharmacist");
  await openPharmacyMenu(page, "処方一覧");
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: "マグミット" });
  await row.locator(".rx-verification__mark").waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  await mark(row.getByRole("button", { name: "疑義照会" }), { label: 1, place: "corner" });
  await shot("01-open", { target: row });
  await clearMarks();

  await row.getByRole("button", { name: "疑義照会" }).click();
  let modal = page.locator(".modal");
  await modal.getByLabel("照会内容").fill(QUESTION);
  await blur(page);
  await mark(modal.locator(".prescription-detail__common"), { label: 1 });
  await mark(modal.getByLabel("照会内容"), { label: 2 });
  await mark(modal.getByRole("button", { name: "送信" }), { label: 3 });
  await shot("02-send", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "送信" }).click();
  await modal.waitFor({ state: "detached" });

  await row.locator(".lab-worklist__status", { hasText: "照会中" }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "疑義照会" }), { label: 2, place: "corner" });
  await shot("03-on-hold", { target: row });
  await clearMarks();
  await logout(page);

  // 医師に通知が届く
  await login("doctor");
  await page.waitForLoadState("networkidle");
  const noticeCard = page.locator(".home__grid > *").filter({ hasText: "未対応の通知" });
  const notice = noticeCard.getByRole("row").filter({ hasText: "疑義照会" });
  await notice.waitFor();
  await mark(notice, { label: 1 });
  await shot("04-notice", { target: noticeCard });
  await clearMarks();

  // カルテの処方から回答する
  await openKarte(page, PHARMACY_PATIENT);
  await page.waitForLoadState("networkidle");
  const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card--prescription").first();
  await card.locator(".micro-result__badge", { hasText: "疑義照会中" }).waitFor();
  await card.getByRole("button", { name: /の操作$/ }).click();
  await mark(card.locator(".micro-result__badge"), { label: 1, place: "corner" });
  await mark(menuItem(page, "詳細表示"), { label: 2 });
  await shot("05-card", { target: [card, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await menuItem(page, "詳細表示").click();

  modal = page.locator(".modal").last();
  const section = modal.locator(".rx-inquiry-section");
  await section.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(section.locator(".rx-inquiry__item").first(), { label: 1 });
  await mark(section.getByRole("button", { name: "回答", exact: true }), { label: 2 });
  await shot("06-detail", { target: section, padding: 40 });
  await clearMarks();
  await section.getByRole("button", { name: "回答", exact: true }).click();

  const answer = page.locator(".modal").filter({ hasText: "疑義照会の回答" }).last();
  await answer.waitFor();
  await answer.getByText("処方どおり", { exact: true }).click();
  await answer.locator("textarea").fill(ANSWER);
  await blur(page);
  await mark(answer.locator(".prescription-detail__common"), { label: 1 });
  await mark(answer.getByRole("radiogroup", { name: "回答区分" }), { label: 2 });
  await mark(answer.locator("textarea"), { label: 3 });
  await mark(answer.getByRole("button", { name: "回答", exact: true }), { label: 4 });
  await shot("07-answer", { target: answer, padding: 40 });
  await clearMarks();
  await answer.getByRole("button", { name: "回答", exact: true }).click();
  await answer.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "detached" });
  await logout(page);

  // 薬剤師が回答を確かめる
  await login("pharmacist");
  await openPharmacyMenu(page, "処方一覧");
  await row.locator(".rx-inquiry__answer").waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator(".lab-worklist__status"), { label: 1, place: "corner" });
  await mark(row.locator(".rx-inquiry__answer"), { label: 2, place: "corner" });
  await mark(row.getByRole("button", { name: "調剤登録" }), { label: 3, place: "corner" });
  await shot("08-answered", { target: row });
  await clearMarks();

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
