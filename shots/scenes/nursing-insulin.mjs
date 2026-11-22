// 操作マニュアル「血糖インスリン」(docs/manual/nursing-insulin.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。2 型糖尿病で血糖スケールのインスリン)の朝と昼のインスリンを
// 血糖インスリン指示の画面から記録する。7 時 40 分(朝)と 11 時 35 分(昼)にブラウザの時計を合わせる。
// 撮影の前後に、カルテのインスリンのカードの「実施取消」と、撮影日 8 時以降の看護の記録の片付けで元に戻す。
import { blur, dayGroup, fhirApi, menuItem, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId, openNursingMenu, removeShootingDayNursing } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const INSULIN = "ヒューマリン";
const MORNING = new Date(`${SHOOTING_DATE}T07:40:00+09:00`);
const NOON = new Date(`${SHOOTING_DATE}T11:35:00+09:00`);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await page.clock.setSystemTime(MORNING);
  await login("nurse");
  const patientId = await nursingPatientId(page);
  const api = await fhirApi(page);
  const patient = await api.read(`Patient/${patientId}`);
  const patientNumber = patient.identifier?.[0]?.value ?? "";
  const insulinOrder = await findInsulinOrder(api, patientId);
  const rpBarcode = `INJ-${insulinOrder.id.replaceAll("-", "").toUpperCase().slice(0, 12)}-1`;

  const cleanUp = async () => {
    await openKarte(page, NURSING_PATIENT);
    await page.waitForLoadState("networkidle");
    const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: INSULIN }).first();
    await card.getByRole("button", { name: /の操作$/ }).click();
    const cancel = menuItem(page, "実施取消");
    if (await cancel.count()) {
      page.once("dialog", (dialog) => dialog.accept());
      await cancel.click();
      await page.waitForLoadState("networkidle");
    } else {
      await page.keyboard.press("Escape");
    }
    await removeShootingDayNursing(page, patientId);
  };
  await cleanUp();

  // 血糖インスリン指示の画面
  await openNursingMenu(page, "血糖インスリン");
  const table = page.locator("table").first();
  const row = (time, kind) => table.getByRole("row").filter({ hasText: time }).filter({ hasText: kind }).first();
  await row("07:30", "インスリン").waitFor();
  await page.waitForLoadState("networkidle");
  const filter = (text) => page.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await mark(filter("勤務帯"), { label: 1, place: "corner" });
  await mark(filter("区分"), { label: 2, place: "corner" });
  await mark(row("07:30", "血糖測定").locator("td").nth(3), { label: 3, place: "corner" });
  await mark(row("07:30", "インスリン").locator("td").nth(4), { label: 4, place: "corner" });
  await mark(row("07:30", "インスリン").getByRole("button", { name: "実施" }), { label: 5, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), table] });
  await clearMarks();

  // 朝のインスリン: 7:30 の血糖値が入っている
  const modal = await openPerform(page, row("07:30", "インスリン"), patientNumber, rpBarcode);
  const glucose = modal.locator("label").filter({ hasText: /^血糖値/ }).first();
  const doseRow = modal.locator("tr").filter({ hasText: INSULIN });
  await mark(glucose.locator(".."), { label: 1, place: "corner" });
  await mark(doseRow.locator("td").nth(1), { label: 2, place: "corner" });
  await mark(doseRow.locator("input[type=number], input[type=text]").first(), { label: 3, place: "corner" });
  const submit = modal.getByRole("button", { name: "実施登録" });
  await mark(submit, { label: 4, place: "corner" });
  await shot("02-morning", { target: modal });
  await clearMarks();
  await submit.click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 昼のインスリン: その場で血糖値を入れる
  await page.clock.setSystemTime(NOON);
  await page.reload();
  await row("11:30", "インスリン").waitFor();
  await page.waitForLoadState("networkidle");
  const noon = await openPerform(page, row("11:30", "インスリン"), patientNumber, rpBarcode);
  await noon.locator("label").filter({ hasText: /^血糖値/ }).first().locator("input").fill("198");
  await blur(page);
  const noonDose = noon.locator("tr").filter({ hasText: INSULIN });
  await mark(noon.locator("label").filter({ hasText: /^血糖値/ }).first(), { label: 1, place: "corner" });
  await mark(noonDose.locator("td").nth(1), { label: 2, place: "corner" });
  await shot("03-noon", { target: noon });
  await clearMarks();
  await noon.getByRole("button", { name: "実施登録" }).click();
  await noon.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shot("04-done", { target: [page.locator(".page__header"), table] });

  await cleanUp();
}

/** 撮影日の、血糖スケールのインスリンの注射オーダー。 */
async function findInsulinOrder(api, patientId) {
  const requests = await api.search("MedicationRequest", { patient: patientId, _count: "100" });
  const insulin = requests.filter((mr) => mr.medicationCodeableConcept?.text?.includes(INSULIN) || mr.medicationCodeableConcept?.coding?.some((c) => c.display?.includes(INSULIN)));
  const orderIds = new Set(insulin.flatMap((mr) => (mr.basedOn ?? []).map((r) => r.reference?.split("/").pop())));
  const orders = await api.search("ServiceRequest", { patient: patientId, _count: "100" });
  const order = orders.find((sr) => orderIds.has(sr.id) && sr.occurrenceDateTime?.startsWith(SHOOTING_DATE));
  if (!order) throw new Error("撮影日のインスリンの注射オーダーがありません。撮影用データを流し直してください");
  return order;
}

/** 行の「実施」から実施入力を開き、患者番号と注射ラベルを読んで照合を済ませる。 */
async function openPerform(page, row, patientNumber, rpBarcode) {
  await row.getByRole("button", { name: "実施" }).click();
  const modal = page.locator(".modal").filter({ hasText: "注射の実施入力" }).last();
  const field = modal.locator("input").first();
  await field.waitFor();
  await page.waitForTimeout(800);
  for (const code of [patientNumber, rpBarcode]) {
    await modal.locator("input").first().fill(code);
    await modal.locator("input").first().press("Enter");
    await page.waitForTimeout(800);
  }
  await modal.getByRole("button", { name: "照合完了" }).click();
  await modal.getByRole("button", { name: "実施登録" }).waitFor();
  await page.waitForLoadState("networkidle");
  return modal;
}
