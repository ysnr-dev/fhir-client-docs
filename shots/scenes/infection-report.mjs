// 操作マニュアル「感染症発生届・感染サーベイランス」(docs/manual/infection-report.md)
// 発生届: 医師 四郎が見本 健一に撮影日の病名「百日咳」(五類・全数把握)を付け、感染症発生届の一覧と、「届出」から開く
// 発生届のテンプレートを撮る。
// 感染サーベイランス: 医師 四郎が見本 太郎に撮影日の腹腔鏡下胃切除術を申し込み、看護 次郎が実施まで記録する。時計を術後 7 日
// (2027-02-08)に進めて、医師 四郎が SSI 判定の一覧から判定を登録し、SSI 発生率を撮る。
// 撮影の前後に、見本 健一の病名と発生届、撮影日に申し込んだ手術(判定ごと)を消す。
import { addDays, blur, fhirApi, labeled, logout, openKarte, pickRow, settle } from "../lib/karte.mjs";
import { patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";
import { SURGERY_CASES, performSurgery, registerSurgery, removeShootingSurgeries } from "../lib/surgery.mjs";

const REPORT_PATIENT = "見本 健一";
const DISEASE = "百日咳";
const GASTRIC = SURGERY_CASES.gastric;
const JUDGE_DATE = addDays(SHOOTING_DATE, 7);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const reportPatientId = await patientIdByName(page, REPORT_PATIENT);
  const removeReportRecords = async () => {
    const api = await fhirApi(page);
    for (const response of await api.search("QuestionnaireResponse", { patient: reportPatientId, _count: "500" })) {
      await api.remove("QuestionnaireResponse", response.id);
    }
    for (const condition of await api.search("Condition", { patient: reportPatientId, _count: "500" })) {
      await api.remove("Condition", condition.id);
    }
  };
  await removeReportRecords();
  await removeShootingSurgeries(page);

  // 発生届の対象になる病名を付ける
  await addCondition(page, REPORT_PATIENT, DISEASE);

  // 感染症発生届の一覧
  await page.goto("/infectious-disease-reports");
  const filters = page.locator(".patient-search-form");
  await labeled(filters, "診断日").locator("input[type=date]").first().fill(SHOOTING_DATE);
  await filters.getByLabel("診断日の終わり").fill(SHOOTING_DATE);
  const rows = page.locator(".lab-worklist tbody tr");
  const row = rows.filter({ hasText: REPORT_PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await rows.count()) !== 1) throw new Error("感染症発生届の一覧に撮影用でない行があります");
  await blur(page);
  await mark(labeled(filters, "診断日"), { label: 1, place: "corner" });
  await mark(labeled(filters, "類型"), { label: 2, place: "corner" });
  await mark(labeled(filters, "状態"), { label: 3, place: "corner" });
  await mark(labeled(filters, "期限"), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(5), { label: 5, place: "corner" });
  await mark(row.locator("td").nth(8), { label: 6, place: "corner" });
  await mark(row.locator("td").nth(10), { label: 7, place: "corner" });
  await mark(row.getByRole("link", { name: "届出" }), { label: 8, place: "corner" });
  await shot("01-report-list", { target: [page.locator(".page__header"), filters, page.locator(".lab-worklist")], padding: 24 });
  await clearMarks();

  // 発生届を書く
  await row.getByRole("link", { name: "届出" }).click();
  const right = page.locator(".karte-right");
  const trigger = right.locator(".template-select__trigger");
  const form = right.locator("form").first();
  const meta = form.locator(".qp-meta");
  await meta.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  const problem = form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select");
  const firstGroup = form.locator("fieldset").first();
  await mark(trigger, { label: 1, place: "corner" });
  await mark(meta.locator("summary"), { label: 2, place: "corner" });
  await mark(problem, { label: 3, place: "corner" });
  await mark(firstGroup, { label: 4, place: "corner" });
  await shot("02-report-form", { target: [right.getByText("テンプレート登録", { exact: true }), right.getByText("閉じる", { exact: true }), firstGroup], padding: 24 });
  await clearMarks();
  await right.getByRole("button", { name: "閉じる" }).click();

  // 手術を実施まで記録する
  await registerSurgery(page, GASTRIC, { date: SHOOTING_DATE, time: "09:00", duration: 300 });
  await logout(page);
  await login("nurse");
  await performSurgery(page, GASTRIC);
  await logout(page);
  await page.clock.setSystemTime(new Date(`${JUDGE_DATE}T09:00:00+09:00`));
  await login("doctor");

  // SSI 判定の一覧
  await page.goto(`/infection-surveillance?from=${SHOOTING_DATE}&to=${SHOOTING_DATE}`);
  const ssiFilters = page.locator(".patient-search-form");
  await labeled(ssiFilters, "手術日").locator("input[type=date]").first().fill(SHOOTING_DATE);
  await ssiFilters.getByLabel("手術日の終わり").fill(SHOOTING_DATE);
  const ssiRows = page.locator(".lab-worklist tbody tr");
  const ssiRow = ssiRows.filter({ hasText: GASTRIC.patient });
  await ssiRow.waitFor();
  await page.waitForLoadState("networkidle");
  if ((await ssiRows.count()) !== 1) throw new Error("SSI 判定の一覧に撮影用でない行があります");
  await blur(page);
  const tabs = page.locator(".order-select__tabs");
  await mark(tabs, { label: 1, place: "corner" });
  await mark(labeled(ssiFilters, "手術日"), { label: 2, place: "corner" });
  await mark(labeled(ssiFilters, "判定"), { label: 3, place: "corner" });
  await mark(ssiRow.locator("td").nth(7), { label: 4, place: "corner" });
  await mark(ssiRow.locator("[class*=hai__state--]"), { label: 5, place: "corner" });
  await mark(ssiRow.getByRole("button", { name: "判定" }), { label: 6, place: "corner" });
  await shot("03-ssi-list", { target: [page.locator(".page__header"), tabs, ssiFilters, page.locator(".lab-worklist")], padding: 24 });
  await clearMarks();

  // 判定を書く
  await ssiRow.getByRole("button", { name: "判定" }).click();
  const modal = page.locator(".modal").filter({ hasText: "の判定" });
  await labeled(modal, "判定").locator("select").selectOption({ label: "感染あり" });
  await labeled(modal, "診断日").locator("input").fill(addDays(SHOOTING_DATE, 5));
  await labeled(modal, "感染部位").locator("select").selectOption({ label: "表層切開創" });
  await labeled(modal, "起因菌").locator("input").fill("Staphylococcus aureus");
  await blur(page);
  await settle(modal);
  await mark(modal.locator(".walk-in__patient"), { label: 1, place: "corner" });
  await mark(labeled(modal, "判定"), { label: 2, place: "corner" });
  await mark(labeled(modal, "診断日"), { label: 3, place: "corner" });
  await mark(labeled(modal, "感染部位"), { label: 4, place: "corner" });
  await mark(labeled(modal, "埋入物"), { label: 5, place: "corner" });
  await mark(labeled(modal, "起因菌"), { label: 6, place: "corner" });
  await mark(modal.getByRole("button", { name: "登録" }), { label: 7, place: "corner" });
  await shot("04-ssi-judge", { target: modal, padding: 24 });
  await clearMarks();
  await modal.getByRole("button", { name: "登録" }).click();
  await modal.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // SSI 発生率
  await tabs.getByRole("tab", { name: "SSI発生率" }).click();
  const rateTable = page.locator(".stat-table").first();
  await rateTable.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(page.locator(".stat-summary, .stat-tiles").first(), { label: 1, place: "corner" });
  await mark(rateTable, { label: 2, place: "corner" });
  await shot("05-ssi-rate", { target: [page.locator(".page__header"), tabs, page.locator(".stat-table").last()], padding: 24 });
  await clearMarks();

  await removeShootingSurgeries(page);
  await removeReportRecords();
}

/** 患者のカルテの病名タブで、病名マスタから病名を選んで登録する(開始日は今日のまま)。 */
async function addCondition(page, patient, disease) {
  await openKarte(page, patient);
  await page.locator(".karte-tabs__list").getByRole("tab", { name: "病名", exact: true }).click();
  const left = page.locator(".karte-left");
  await left.getByRole("button", { name: "新規登録" }).click();
  const form = left.locator("form.prescription-form");
  const diseaseSet = form.locator("fieldset").first();
  await diseaseSet.getByRole("button", { name: "病名選択" }).click();
  const modal = page.locator(".modal");
  await modal.getByRole("textbox").first().fill(disease);
  const diseaseRow = modal.getByRole("row").filter({ has: page.getByRole("cell", { name: disease, exact: true }) });
  await diseaseRow.waitFor();
  await pickRow(diseaseRow);
  await modal.waitFor({ state: "detached" });
  await form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true }).click();
  await left.locator("table.patient-table").getByRole("row").filter({ hasText: disease }).waitFor();
}
