// 操作マニュアル「入院予定」(docs/manual/admission-plan.md)
// 外来の「見本 花子」に、撮影日の 1 週後の見本病棟 101 ベッド2 への入院予定を登録し、入院患者一覧の「入院予定」で確かめる。
// 撮影の前後に、この患者の入院予定を消す(予定は画面から取り消しても記録が残るので、直接消す)。
import { addDays, blur, fhirApi, labeled, openKarte, patientIdOf } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const WARD = "見本病棟";
const DOCTOR = "医師 四郎";
const ADMISSION_DATE = addDays(SHOOTING_DATE, 7);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  await removePlannedAdmissions(page, patientId);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "入院予定", exact: true }).click();
  const form = right.locator(".karte-right__body, .karte-right").first();
  const ward = labeled(form, "病棟").locator("select");
  await ward.locator("option", { hasText: WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: WARD });
  const room = labeled(form, "病室").locator("select");
  await room.locator("option", { hasText: "101" }).waitFor({ state: "attached" });
  await room.selectOption({ label: "101" });
  const bed = labeled(form, "ベッド").locator("select");
  await bed.locator("option").nth(2).waitFor({ state: "attached" });
  await bed.selectOption({ index: 2 });
  await labeled(form, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(form, "主治医").locator("select").selectOption({ label: DOCTOR });
  await labeled(form, "入院予定日").locator("input[type=date]").fill(ADMISSION_DATE);
  await labeled(form, "入院経路").locator("select").selectOption({ label: "家庭からの入院" });
  await labeled(form, "予定・救急医療入院").locator("select").selectOption({ label: "予定入院" });
  await labeled(form, "特記事項").locator("textarea").fill("降圧薬の調整と下腿浮腫の精査のため。");
  await blur(page);

  const submit = form.getByRole("button", { name: "入院予定登録" });
  await mark(labeled(form, "病棟"), { label: 1, place: "corner" });
  await mark(bed, { label: 2, place: "corner" });
  await mark(labeled(form, "主治医"), { label: 3, place: "corner" });
  await mark(labeled(form, "担当看護師").locator("select"), { label: 4, place: "corner" });
  await mark(labeled(form, "入院予定日").locator("input[type=date]"), { label: 5, place: "corner" });
  await mark(labeled(form, "入院経路"), { label: 6, place: "corner" });
  await mark(labeled(form, "特記事項"), { label: 7, place: "corner" });
  await mark(submit, { label: 8 });
  await shot("01-form", { target: [labeled(form, "病棟"), submit, labeled(form, "特記事項")], padding: 32 });
  await clearMarks();
  await submit.click();
  await submit.waitFor({ state: "detached" });

  // 入院患者一覧の入院予定
  await page.goto("/inpatients?tab=planned");
  const wardSelect = labeled(page.locator(".patient-search-form"), "病棟").locator("select");
  await wardSelect.locator("option", { hasText: WARD }).waitFor({ state: "attached" });
  await wardSelect.selectOption({ label: WARD });
  const row = page.getByRole("row").filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(page.getByRole("tab", { name: "入院予定", exact: true }), { label: 1, place: "corner" });
  await mark(row, { label: 2 });
  await shot("02-list", { target: [page.getByRole("tab", { name: "入院予定", exact: true }), page.locator("table").filter({ has: row })], padding: 24 });
  await clearMarks();

  await removePlannedAdmissions(page, patientId);
}

/** 患者の入院予定(予定・取り消しのままの入院)をすべて消す。 */
async function removePlannedAdmissions(page, patientId) {
  const api = await fhirApi(page);
  for (const encounter of await api.search("Encounter", { patient: patientId, status: "planned,cancelled", _count: "100" })) {
    await api.remove("Encounter", encounter.id);
  }
}
