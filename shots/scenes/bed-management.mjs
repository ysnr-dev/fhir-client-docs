// 操作マニュアル「ベッドスケジュール・病床状況」(docs/manual/bed-management.md)
// 医師 四郎が、見本 健一(撮影日の翌日に見本病棟 102 ベッド1)と見本 和子(3 日後に見本病棟、ベッド未定)の入院予定を入れ、
// 見本病棟のベッドスケジュールと、病院全体の病床状況を撮る。撮影の前後に、2 人の入院予定を直接消す。
import { addDays, fhirApi, labeled, openKarte } from "../lib/karte.mjs";
import { SHOOTING_WARD } from "../lib/nursing.mjs";
import { DOCTOR, patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PLANS = [
  { patient: "見本 健一", days: 1, room: "102", note: "大腸ポリープの内視鏡的切除。" },
  { patient: "見本 和子", days: 3, room: null, note: "心不全の精査。" },
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const patientIds = [];
  for (const { patient } of PLANS) patientIds.push(await patientIdByName(page, patient));
  const cleanUp = () => removePlans(page, patientIds);
  await cleanUp();
  for (const plan of PLANS) await planAdmission(page, plan);

  // ベッドスケジュール
  await page.goto("/bed-schedule");
  const form = page.locator(".patient-search-form");
  const ward = labeled(form, "病棟").locator("select");
  await ward.locator("option", { hasText: SHOOTING_WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: SHOOTING_WARD });
  const grid = page.locator(".bed-schedule");
  await grid.locator(".bed-schedule__bar--planned").filter({ hasText: PLANS[0].patient }).waitFor();
  await page.waitForLoadState("networkidle");
  await mark(labeled(form, "開始日"), { label: 1, place: "corner" });
  await mark(labeled(form, "期間"), { label: 2, place: "corner" });
  await mark(grid.locator(".bed-schedule__bar--actual").first(), { label: 3, place: "corner" });
  await mark(grid.locator(".bed-schedule__bar--future").first(), { label: 4, place: "corner" });
  await mark(grid.locator(".bed-schedule__bar--planned").filter({ hasText: PLANS[0].patient }), { label: 5, place: "corner" });
  await mark(grid.locator("tr").filter({ hasText: "ベッド未定" }).locator(".bed-schedule__bar--planned"), { label: 6, place: "corner" });
  await mark(page.locator(".bed-schedule__legend"), { label: 7, place: "corner" });
  await shot("01-schedule", { target: [page.locator(".page__header"), form, grid], padding: 24 });
  await clearMarks();

  // 病床状況
  await page.goto(`/bed-status?date=${SHOOTING_DATE}`);
  const table = page.locator(".stat-table");
  await table.getByRole("link", { name: SHOOTING_WARD }).waitFor();
  await page.waitForLoadState("networkidle");
  const statusForm = page.locator(".patient-search-form");
  await mark(labeled(statusForm, "日付"), { label: 1, place: "corner" });
  await mark(labeled(statusForm, "集計期間"), { label: 2, place: "corner" });
  await mark(page.locator(".stat-summary, .stat-tiles").first(), { label: 3, place: "corner" });
  await mark(table.getByRole("link", { name: SHOOTING_WARD }), { label: 4, place: "corner" });
  await shot("02-status", { target: [page.locator(".page__header"), statusForm, table], padding: 24 });
  await clearMarks();

  await cleanUp();
}

/** カルテの右ペインの「入院予定」で、見本病棟への入院予定を入れる(room が無ければベッド未定)。 */
async function planAdmission(page, { patient, days, room, note }) {
  await openKarte(page, patient);
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "入院予定", exact: true }).click();
  const ward = labeled(right, "病棟").locator("select");
  await ward.locator("option", { hasText: SHOOTING_WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: SHOOTING_WARD });
  if (room) {
    const roomSelect = labeled(right, "病室").locator("select");
    await roomSelect.locator("option", { hasText: room }).waitFor({ state: "attached" });
    await roomSelect.selectOption({ label: room });
    const bed = labeled(right, "ベッド").locator("select");
    await bed.locator("option").nth(1).waitFor({ state: "attached" });
    await bed.selectOption({ index: 1 });
  }
  await labeled(right, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(right, "主治医").locator("select").selectOption({ label: DOCTOR });
  await labeled(right, "入院予定日").locator("input[type=date]").fill(addDays(SHOOTING_DATE, days));
  await labeled(right, "入院経路").locator("select").selectOption({ label: "家庭からの入院" });
  await labeled(right, "予定・救急医療入院").locator("select").selectOption({ label: "予定入院" });
  await labeled(right, "特記事項").locator("textarea").fill(note);
  const submit = right.getByRole("button", { name: "入院予定登録" });
  await submit.click();
  await submit.waitFor({ state: "detached" });
}

/** 患者の入院予定を消す。 */
async function removePlans(page, patientIds) {
  const api = await fhirApi(page);
  for (const patientId of patientIds) {
    for (const encounter of await api.search("Encounter", { patient: patientId, status: "planned,cancelled", _count: "100" })) {
      await api.remove("Encounter", encounter.id);
    }
  }
}
