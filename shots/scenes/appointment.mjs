// 操作マニュアル「予約」(docs/manual/appointment.md)
// 外来の「見本 花子」に、撮影の医師の枠(撮影用データの「内科 午前」)で 4 週後の再診を予約する。
// 撮影の前後に、この患者の予約を消して枠を空きに戻す(取り消した予約も予約タブに残るので、画面ではなく直接消す)。
import { addDays, blur, fhirApi, labeled, menuItem, openKarte, patientIdOf } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const DOCTOR = "医師 四郎";
const VISIT_DATE = addDays(SHOOTING_DATE, 28);
const VISIT_TIME = "09:30";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  await removeAppointments(page, patientId);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "予約", exact: true }).click();

  // 枠を選ぶ
  const schedule = right.locator(".appointment-picker__schedule select");
  await schedule.locator("option", { hasText: DOCTOR }).first().waitFor({ state: "attached" });
  await labeled(right, "担当医").locator("select").selectOption({ label: DOCTOR });
  await schedule.selectOption({ label: `内科 午前(${DOCTOR})` });
  const month = right.locator(".appointment-month");
  await month.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(labeled(right, "診療科"), { label: 1, place: "corner" });
  await mark(labeled(right, "担当医"), { label: 2, place: "corner" });
  await mark(schedule, { label: 3, place: "corner" });
  await shot("01-schedule", { target: [labeled(right, "診療科"), schedule, month], padding: 24 });
  await clearMarks();

  // 日と時刻を選ぶ
  const header = right.locator(".appointment-month__header");
  await header.getByRole("button", { name: /翌月/ }).click();
  await header.filter({ hasText: `${VISIT_DATE.slice(0, 4)}年${Number(VISIT_DATE.slice(5, 7))}月` }).waitFor();
  const day = month.locator("td button, td").filter({ hasText: new RegExp(`^\\s*${Number(VISIT_DATE.slice(8))}\\s*空き`) }).first();
  await day.click();
  const times = right.locator(".appointment-times");
  const time = times.getByRole("button", { name: new RegExp(`^${VISIT_TIME}`) });
  await time.click();
  await right.getByLabel("メモ").fill("4 週後の再診。採血あり。");
  await blur(page);
  const submit = right.getByRole("button", { name: "登録", exact: true });
  await mark(header, { label: 1, place: "corner" });
  await mark(day, { label: 2, place: "corner" });
  await mark(time, { label: 3, place: "corner" });
  await mark(right.getByLabel("メモ"), { label: 4, place: "corner" });
  await mark(submit, { label: 5 });
  await shot("02-slot", { target: [header, submit, times], padding: 32 });
  await clearMarks();
  await submit.click();

  // 予約タブ
  await page.locator(".karte-tabs__list").getByRole("tab", { name: "予約", exact: true }).click();
  const left = page.locator(".karte-left");
  const row = left.getByRole("row").filter({ hasText: VISIT_DATE.replaceAll("-", "/") }).or(left.getByRole("row").filter({ hasText: VISIT_DATE })).first();
  await row.waitFor();
  await row.getByRole("button", { name: /の予約の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(left.getByLabel("表示期間"), { label: 1, place: "corner" });
  await mark(menuItem(page, "日時変更"), { label: 2 });
  await mark(menuItem(page, "取消"), { label: 3 });
  await shot("03-list", { target: [left.locator(".patient-chart__toolbar"), left.locator("table"), menu], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  await removeAppointments(page, patientId);
}

/** 患者の予約をすべて消し、押さえていた枠を空きに戻す。 */
async function removeAppointments(page, patientId) {
  const api = await fhirApi(page);
  for (const appointment of await api.search("Appointment", { patient: patientId, _count: "100" })) {
    for (const ref of appointment.slot ?? []) {
      const slot = await api.read(ref.reference);
      if (slot.status !== "free") await api.update({ ...slot, status: "free" });
    }
    await api.remove("Appointment", appointment.id);
  }
}
