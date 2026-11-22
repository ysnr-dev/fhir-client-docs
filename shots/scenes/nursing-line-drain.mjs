// 操作マニュアル「留置物管理」(docs/manual/nursing-line-drain.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。抗菌薬の点滴中)に、入院日に入れた末梢静脈カテーテルを登録し、
// 留置物管理で観察を記録する。撮影の前後に、この患者の留置物(挿入の記録・管・観察)を直接消す。
import { addDays, blur, fhirApi, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId, openNursingMenu } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const INSERTED_AT = `${addDays(SHOOTING_DATE, -3)}T10:00`;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeLineDrains(page, patientId);

  // 留置物を登録する
  await openKarte(page, NURSING_PATIENT);
  const pane = page.locator(".karte-right");
  await pane.locator(".karte-right__group-toggle", { hasText: "看護" }).click();
  await pane.getByRole("button", { name: "留置物", exact: true }).click();
  const body = pane.locator(".karte-right__body");
  const field = (text) => body.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await field("種別").locator("select").selectOption({ label: "末梢静脈カテーテル" });
  await field("部位").locator("input").fill("左前腕");
  await field("サイズ").locator("input").fill("22G");
  await field("挿入日時").locator("input").fill(INSERTED_AT);
  await field("目的").locator("input").fill("抗菌薬の点滴");
  await blur(page);
  const submit = body.getByRole("button", { name: "登録", exact: true });
  await mark(field("種別"), { label: 1, place: "corner" });
  await mark(field("部位"), { label: 2, place: "corner" });
  await mark(field("挿入日時"), { label: 3, place: "corner" });
  await mark(field("挿入者"), { label: 4, place: "corner" });
  await mark(field("目的"), { label: 5, place: "corner" });
  await mark(submit, { label: 6, place: "corner" });
  await shot("01-form", { target: [field("種別"), submit] });
  await clearMarks();
  await submit.click();
  await submit.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 留置物管理
  await openNursingMenu(page, "留置物管理");
  const table = page.locator("table").first();
  const row = table.getByRole("row").filter({ hasText: NURSING_PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  const cell = (index) => row.locator("td").nth(index);
  await mark(page.locator("label").filter({ hasText: /^区分/ }).first(), { label: 1, place: "corner" });
  await mark(cell(6), { label: 2, place: "corner" });
  await mark(cell(7), { label: 3, place: "corner" });
  await mark(row.getByRole("button", { name: "観察" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "抜去" }), { label: 5, place: "corner" });
  await shot("02-list", { target: [page.locator(".page__header, h1").first(), table] });
  await clearMarks();

  // 観察
  await row.getByRole("button", { name: "観察" }).click();
  const modal = page.locator(".modal").last();
  await modal.waitFor();
  const item = (label) => modal.getByRole("row").filter({ hasText: label });
  for (const label of ["発赤", "腫脹", "疼痛", "滲出液"]) await item(label).getByRole("button", { name: "なし", exact: true }).click();
  for (const label of ["固定", "開通性"]) await item(label).getByRole("button", { name: "良", exact: true }).click();
  await item("所見・処置").locator("input").fill("刺入部に異常なし");
  await blur(page);
  const save = modal.getByRole("button", { name: "登録", exact: true });
  await mark(item("観察日時").locator("input"), { label: 1, place: "corner" });
  await mark(item("発赤").locator("td").last(), { label: 2, place: "corner" });
  await mark(item("ドレッシング交換").locator("input"), { label: 3, place: "corner" });
  await mark(item("所見・処置").locator("input"), { label: 4, place: "corner" });
  await mark(save, { label: 5, place: "corner" });
  await shot("03-observe", { target: [modal.locator(".modal__header"), save], padding: 24 });
  await clearMarks();
  await save.click();
  // 登録すると画面は開いたまま、上に観察の履歴が出る。
  await modal.getByText("刺入部に異常なし").first().waitFor();
  await page.waitForLoadState("networkidle");
  await shot("04-history", { target: [modal.locator(".modal__header"), modal.getByRole("button", { name: "閉じる" }).last()], padding: 24 });
  await modal.getByRole("button", { name: "閉じる" }).last().click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await mark(cell(7), { label: 1, place: "corner" });
  await shot("05-observed", { target: row });
  await clearMarks();

  // 抜去
  await row.getByRole("button", { name: "抜去" }).click();
  const removal = page.locator(".modal").last();
  await removal.waitFor();
  await page.waitForTimeout(300);
  await shot("06-remove", { target: removal.locator(".modal__header, form, table").first().locator("..") });
  await removal.getByRole("button", { name: "閉じる" }).last().click();

  // デバイス日数
  await page.getByRole("tab", { name: "デバイス日数" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shot("07-device-days", { target: [page.getByRole("tab", { name: "留置中" }), page.getByText("気管チューブ").first(), page.locator("table").first()], padding: 24 });

  await removeLineDrains(page, patientId);
}

/** 看護の患者の留置物(挿入の記録・管・観察)を消す。撮影用データには無いので、すべて消してよい。 */
async function removeLineDrains(page, patientId) {
  const api = await fhirApi(page);
  const insertions = (await api.search("Procedure", { patient: patientId, _count: "500" })).filter((p) => p.focalDevice?.length);
  for (const insertion of insertions) {
    const observations = await api.search("Observation", { "part-of": `Procedure/${insertion.id}`, _count: "500" });
    for (const observation of observations.filter((o) => o.partOf?.some((r) => r.reference === `Procedure/${insertion.id}`))) {
      await api.remove("Observation", observation.id);
    }
    await api.remove("Procedure", insertion.id);
    for (const device of insertion.focalDevice) {
      const id = device.manipulated?.reference?.split("/").pop();
      if (id) await api.remove("Device", id);
    }
  }
}
