// 外来・救急の受付のシーンで共通に使う画面操作と片付け。
// 撮影用の外来の患者(見本 花子・見本 健一・見本 和子・見本 次郎)に撮影日の予約・受付を作り、撮影の前後に消す。
import { blur, fhirApi, labeled, openKarte, patientIdOf } from "./karte.mjs";

export const DOCTOR = "医師 四郎";
const SCHEDULE = `内科 午前(${DOCTOR})`;

/** 患者の ID(氏名で 1 人に絞る)。 */
export async function patientIdByName(page, name) {
  const api = await fhirApi(page);
  const [family, given] = name.split(" ");
  const patients = (await api.search("Patient", { family, given })).filter((p) =>
    p.name?.some((n) => n.family === family && n.given?.includes(given)),
  );
  if (patients.length !== 1) throw new Error(`患者「${name}」が 1 人に絞れません`);
  return patients[0].id;
}

/**
 * 患者の、その日(YYYY-MM-DD)の外来の予約・受付と外来の診察(Encounter)を消し、予約が押さえていた枠を空きに戻す。
 * 検査の予約(オーダーにぶら下がる予約)は残す。
 */
export async function removeVisits(page, patientIds, day) {
  const api = await fhirApi(page);
  for (const patientId of patientIds) {
    const encounters = await api.search("Encounter", { patient: patientId, class: "AMB", date: day, _count: "100" });
    for (const encounter of encounters.filter((e) => e.class?.code === "AMB" && e.period?.start?.startsWith(day))) {
      await api.remove("Encounter", encounter.id);
    }
    const appointments = await api.search("Appointment", { patient: patientId, date: day, _count: "100" });
    for (const appointment of appointments.filter((a) => !a.basedOn?.length && a.start?.startsWith(day))) {
      for (const { reference } of appointment.slot ?? []) {
        const slot = await api.read(reference);
        if (slot.status !== "free") await api.update({ ...slot, status: "free" });
      }
      await api.remove("Appointment", appointment.id);
    }
  }
}

/** カルテの右ペインの「予約」から、撮影の医師の「内科 午前」の撮影日の枠(time: "09:00")を予約する。 */
export async function bookVisit(page, patientName, time) {
  await openKarte(page, patientName);
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "予約", exact: true }).click();
  const schedule = right.locator(".appointment-picker__schedule select");
  await schedule.locator("option", { hasText: DOCTOR }).first().waitFor({ state: "attached" });
  await labeled(right, "担当医").locator("select").selectOption({ label: DOCTOR });
  await schedule.selectOption({ label: SCHEDULE });
  const month = right.locator(".appointment-month");
  await month.waitFor();
  await page.waitForLoadState("networkidle");
  const day = new Date(await page.evaluate(() => Date.now())).getDate();
  await month.locator("td button, td").filter({ hasText: new RegExp(`^\\s*${day}\\s*空き`) }).first().click();
  await right.locator(".appointment-times").getByRole("button", { name: new RegExp(`^${time}`) }).click();
  await blur(page);
  const saved = page.waitForResponse((r) => r.url().includes("/fhir") && r.request().method() === "POST" && r.ok());
  await right.getByRole("button", { name: "登録", exact: true }).click();
  await saved;
  await page.waitForLoadState("networkidle");
  return patientIdOf(page);
}
