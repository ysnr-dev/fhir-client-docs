// 操作マニュアル「ロット管理」(docs/manual/lot-management.md)
// 医師 四郎が入院中の「見本 太郎」(撮影用の架空の患者)にロット管理の薬(ネスプ・トラマール)の注射を出し、
// 看護 次郎がネスプはロット番号を入れて、トラマールは入れずに実施する。薬剤 三郎がロット管理でロットから投与を引き、
// ロットの入っていない投与にロット番号を入れる。ブラウザの時計を 10 時過ぎに進める。
// 撮影の前後に、見本 太郎のオーダーと実施の記録を消す。
import { blur, dayGroup, logout, menuItem, openKarte } from "../lib/karte.mjs";
import {
  assertOnlyShootingPatients,
  openPharmacyKarte,
  openPharmacyMenu,
  PHARMACY_PATIENT,
  pharmacyPatientId,
  registerInjection,
  removePharmacyRecords,
} from "../lib/pharmacy.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const MORNING = new Date(`${SHOOTING_DATE}T10:05:00+09:00`);
const LOT = "NS30-2701A";
const LATE_LOT = "TR100-2612";

/** カルテの注射のカードの「実施入力」を開き、バーコードの照合をスキップして実施の欄を出す。 */
async function openPerform(page, medicine) {
  const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: medicine }).first();
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "実施入力").click();
  const modal = page.locator(".modal").last();
  await modal.getByRole("button", { name: "スキップ" }).click();
  await modal.locator("select").first().selectOption({ label: "リーダー不調" });
  await modal.getByRole("button", { name: "スキップ" }).last().click();
  await modal.getByRole("button", { name: "実施登録" }).waitFor();
  return modal;
}

export default async function ({ page, login, mark, clearMarks, shot }) {
  await page.clock.setSystemTime(MORNING);

  // 医師がロット管理の薬の注射を出す
  await login("doctor");
  await openPharmacyKarte(page);
  await registerInjection(page, {
    medicines: [{ query: "ネスプ注射液30μgプラシリンジ", row: "ネスプ", dose: 1 }],
    time: "10:00",
    method: "ワンショット",
    route: "皮下",
  });
  await registerInjection(page, {
    medicines: [{ query: "トラマール注100", row: "トラマール", dose: 1 }],
    time: "10:00",
    category: "臨時",
    method: "ワンショット",
    route: "筋肉内",
  });
  await logout(page);

  // 看護師が実施を記録する(ネスプはロット番号を入れる)
  await login("nurse");
  await openKarte(page, PHARMACY_PATIENT);
  await page.waitForLoadState("networkidle");
  let modal = await openPerform(page, "ネスプ");
  const lot = modal.getByLabel(/のロット番号$/);
  await lot.fill(LOT);
  await blur(page);
  const medicines = modal.locator("table").filter({ has: page.getByLabel(/のロット番号$/) });
  await mark(lot, { label: 1 });
  await mark(modal.getByRole("button", { name: "実施登録" }), { label: 2 });
  await shot("01-perform", { target: [medicines, modal.getByRole("button", { name: "実施登録" })], padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "実施登録" }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  modal = await openPerform(page, "トラマール");
  await modal.getByRole("button", { name: "実施登録" }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await logout(page);

  // ロットから投与した患者を引く
  await login("pharmacist");
  await openPharmacyMenu(page, "ロット管理");
  const search = page.locator(".patient-search-form");
  await search.getByLabel("ロット番号").fill("NS30");
  await search.getByRole("button", { name: "検索", exact: true }).click();
  const rows = page.locator("table tbody tr");
  await rows.filter({ hasText: LOT }).waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(rows);
  const count = page.locator(".lab-worklist__count");
  await blur(page);
  await mark(search.getByLabel("ロット番号"), { label: 1 });
  await mark(search.locator("label").filter({ hasText: "完全一致" }), { label: 2, place: "corner" });
  await mark(search.getByRole("button", { name: "検索", exact: true }), { label: 3, place: "corner" });
  await mark(search.getByRole("button", { name: "CSV" }), { label: 4, place: "corner" });
  await mark(rows.first(), { label: 5, place: "corner" });
  await shot("02-search", { target: [page.locator(".page__header"), count], padding: 24 });
  await clearMarks();

  // ロットの入っていない投与。終了時刻の無い実施は期間を問わず並ぶため、一覧には開発データの投与も出る。
  // 一覧は撮らず、見本 太郎の行から開くロット入力だけを撮る。
  await page.getByRole("tab", { name: "ロット未入力" }).or(page.getByRole("button", { name: "ロット未入力" })).first().click();
  const missing = rows.filter({ hasText: PHARMACY_PATIENT }).filter({ hasText: "トラマール" });
  await missing.waitFor();
  await page.waitForLoadState("networkidle");

  await missing.getByRole("button", { name: "ロット入力" }).click();
  modal = page.locator(".modal");
  await modal.getByLabel(/のロット番号$/).fill(LATE_LOT);
  await blur(page);
  await mark(modal.getByLabel(/のロット番号$/), { label: 1, place: "corner" });
  await mark(modal.getByRole("button", { name: "登録", exact: true }), { label: 2 });
  await shot("03-enter", { target: modal, padding: 40 });
  await clearMarks();
  await modal.getByRole("button", { name: "登録", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await missing.waitFor({ state: "detached" });

  await removePharmacyRecords(page, await pharmacyPatientId(page));
}
