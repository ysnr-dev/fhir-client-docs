// 操作マニュアル「リハビリ一覧」(docs/manual/rehab-worklist.md)
// 医師 四郎が入院の「見本 太郎」(早期胃癌の術後)に撮影日から理学療法(運動器リハ)を依頼し、理学 冬子(理学療法士)が
// リハビリ一覧で受け付け、その日の実施を記録して次回を予約する。一覧には期間の続く開発データのオーダーも並ぶので、
// 病棟を見本病棟に絞って撮る。撮影の前後に、撮影日に出したリハビリを実施記録・予約ごと消す。
import { addDays, blur, labeled, logout, menuItem, openKarte, settle } from "../lib/karte.mjs";
import { removeShootingOrders } from "../lib/department.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const NEXT_DAY = addDays(SHOOTING_DATE, 1);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["rehab"]);
  await openKarte(page, PATIENT);
  await registerRehab(page);
  await logout(page);

  // リハビリ一覧
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T09:30:00+09:00`));
  await login("therapist");
  await openDepartmentMenu(page, "リハビリ部門", "リハビリ一覧");
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("見本病棟のリハビリ一覧に撮影用でない行があります");
  await blur(page);
  await mark(labeled(filters, "基準日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "病棟"), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(6), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(8), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 5, place: "corner" });
  await mark(row.locator("td").nth(10), { label: 6, place: "corner" });
  await mark(row.getByRole("button", { name: "受付" }), { label: 7, place: "corner" });
  await mark(page.locator(".order-select__tabs").getByText(/^予約/), { label: 8, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), row], padding: 24 });
  await clearMarks();

  // 受付と実施
  await row.getByRole("button", { name: "受付" }).click();
  await row.getByRole("button", { name: "次回予約" }).waitFor();
  await page.waitForLoadState("networkidle");
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T11:10:00+09:00`));
  await row.getByRole("button", { name: "実施", exact: true }).click();
  const perform = page.locator(".modal").filter({ hasText: "リハビリの実施入力" });
  const submit = perform.getByRole("button", { name: "実施登録" });
  await submit.waitFor();
  await labeled(perform, "実施時刻").locator("input").fill("10:30");
  await perform.locator("textarea").fill("術後 1 日目。病棟内歩行 50 m を見守りで。起居動作の練習");
  await blur(page);
  await settle(perform);
  await mark(labeled(perform, "実施日"), { label: 1, place: "corner" });
  await mark(labeled(perform, "実施時刻"), { label: 2, place: "corner" });
  await mark(labeled(perform, "療法種別"), { label: 3, place: "corner" });
  await mark(labeled(perform, "実施単位数"), { label: 4, place: "corner" });
  await mark(labeled(perform, "担当療法士"), { label: 5, place: "corner" });
  await mark(perform.locator("textarea"), { label: 6 });
  await mark(submit, { label: 7 });
  await shot("02-perform", { target: perform, padding: 24 });
  await clearMarks();
  await submit.click();
  await perform.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 次回の予約
  await row.getByRole("button", { name: "次回予約" }).click();
  const booking = page.locator(".modal").filter({ hasText: "リハビリの次回予約" });
  const scheduleSelect = labeled(booking, "予約枠").locator("select");
  await scheduleSelect.locator("option").nth(1).waitFor({ state: "attached" });
  await scheduleSelect.selectOption({ index: 1 });
  const picker = booking.locator(".appointment-picker");
  const day = picker.locator(".appointment-month button").filter({ hasText: /^2空き/ }).first();
  await day.click();
  const slot = picker.locator(".appointment-times__list button").nth(2);
  await slot.click();
  await blur(page);
  await settle(booking);
  await mark(labeled(booking, "予約枠"), { label: 1 });
  await mark(day, { label: 2, place: "corner" });
  await mark(slot, { label: 3, place: "corner" });
  await mark(booking.getByRole("button", { name: "この枠で予約" }), { label: 4 });
  await shot("03-booking", { target: booking, padding: 24 });
  await clearMarks();
  await booking.getByRole("button", { name: "この枠で予約" }).click();
  await booking.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  await row.getByRole("button", { name: "このリハビリの操作" }).click();
  await menuItem(page, "終了").waitFor();
  await mark(row.getByText("実施中", { exact: true }), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(10), { label: 3, place: "corner" });
  await mark(menuItem(page, "終了"), { label: 4 });
  await mark(menuItem(page, "中止"), { label: 5 });
  await shot("04-performed", { target: [row, page.locator(".row-menu__items").last()] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 予約のビュー
  await page.locator(".order-select__tabs").getByText(/^予約/).click();
  await page.getByRole("button", { name: "次の日" }).first().click();
  await filters.locator(`input[value="${NEXT_DAY}"]`).waitFor();
  const bookedRow = page.locator("tbody tr").filter({ hasText: PATIENT });
  await bookedRow.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(page.locator(".order-select__tabs").getByText(/^予約/), { label: 1, place: "corner" });
  await mark(filters.locator(`input[value="${NEXT_DAY}"]`), { label: 2, place: "corner" });
  await mark(bookedRow.locator("td").first(), { label: 3, place: "corner" });
  await mark(bookedRow.getByRole("button", { name: /の操作$/ }), { label: 4, place: "corner" });
  await shot("05-bookings", { target: [page.locator(".page__header"), bookedRow], padding: 24 });
  await clearMarks();

  await logout(page);
  await login("doctor");
  await removeShootingOrders(page, await patientIdByName(page, PATIENT), ["rehab"]);
}

/** 開いているカルテから、撮影日に始める理学療法(運動器リハ)を依頼する。 */
async function registerRehab(page) {
  await page.waitForLoadState("networkidle");
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "リハビリ", exact: true }).click();
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  await fieldset("リハビリ内容").waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(fieldset("リハビリ内容"), "疾患別リハ区分").locator("select").selectOption({ label: "運動器リハビリテーション" });
  await fieldset("療法種別").locator("label").filter({ hasText: "理学療法(PT)" }).locator("input").check();
  await labeled(fieldset("実施量"), "1回あたりの単位数").locator("input").fill("2");
  await labeled(fieldset("実施量"), "週あたりの回数").locator("input").fill("5");
  await labeled(fieldset("期間"), "開始日").locator("input").fill(SHOOTING_DATE);
  await labeled(fieldset("対象"), "対象疾患名").locator("input").fill("胃癌術後の廃用予防");
  await labeled(fieldset("対象"), "起算日").locator("input").fill(SHOOTING_DATE);
  await blur(page);
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
}
