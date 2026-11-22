// 操作マニュアル「救急患者一覧」(docs/manual/emergency.md)
// 医師 四郎が撮影日に、救急車で来た見本 勇(胸痛)と自力で来た見本 秀子(発熱)を救急受付し、見本 秀子をトリアージ、
// 見本 勇を診察開始 → 転帰「入院」→ 入院予定の登録まで進める。
// 撮影の前後に、2 人の撮影日の救急受診・トリアージの記録と入院予定を直接消す(画面の取消は記録が残る)。
import { blur, fhirApi, labeled, menuItem, settle } from "../lib/karte.mjs";
import { DOCTOR, patientIdByName } from "../lib/outpatient.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const AMBULANCE = "見本 勇";
const WALK_IN = "見本 秀子";
const WARD = "見本病棟";

const at = (time) => new Date(`${SHOOTING_DATE}T${time}:00+09:00`);

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const patientIds = [await patientIdByName(page, AMBULANCE), await patientIdByName(page, WALK_IN)];
  const cleanUp = () => removeEmergencyVisits(page, patientIds);
  await cleanUp();

  await page.clock.setSystemTime(at("10:05"));
  await page.goto(`/emergency?date=${SHOOTING_DATE}`);
  await page.waitForLoadState("networkidle");
  const table = page.locator("main table").first();
  const row = (name) => table.locator("tbody tr").filter({ hasText: name });

  // 救急受付(救急車)
  await page.getByRole("button", { name: "救急受付" }).click();
  const modal = page.locator(".modal").filter({ hasText: "救急受付" });
  await labeled(modal, "氏名").locator("input").fill(AMBULANCE);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  await modal.locator(".master-search__row").filter({ hasText: AMBULANCE }).click();
  await fillArrival(modal, { mode: "救急車", bed: "救急ベッド1", complaint: "胸痛" });
  await modal.getByRole("radio", { name: /^2 / }).click();
  await blur(page);
  await settle(modal);
  await mark(modal.locator(".emergency__modes"), { label: 1, place: "corner" });
  await mark(modal.locator(".walk-in__patient"), { label: 2, place: "corner" });
  await mark(modal.locator(".walk-in__fields"), { label: 3, place: "corner" });
  await mark(modal.locator(".jtas-picker"), { label: 4, place: "corner" });
  await mark(modal.getByRole("button", { name: "受付", exact: true }), { label: 5, place: "corner" });
  await shot("01-check-in", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "受付", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await row(AMBULANCE).waitFor();

  // 救急受付(自力来院、トリアージは後で)
  await page.clock.setSystemTime(at("10:20"));
  await page.getByRole("button", { name: "救急受付" }).click();
  await labeled(modal, "氏名").locator("input").fill(WALK_IN);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  await modal.locator(".master-search__row").filter({ hasText: WALK_IN }).click();
  await fillArrival(modal, { mode: "自力来院", bed: "救急ベッド2", complaint: "発熱・咳" });
  await modal.getByRole("button", { name: "受付", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await row(WALK_IN).waitFor();

  // 一覧の見方
  await page.clock.setSystemTime(at("10:32"));
  await page.reload();
  await row(WALK_IN).waitFor();
  await page.waitForLoadState("networkidle");
  await assertOnlyShootingPatients(table);
  const filters = page.locator(".patient-search-form");
  await mark(labeled(filters, "来院日"), { label: 1, place: "corner" });
  await mark(page.locator(".outpatient__summary, .emergency__summary").first(), { label: 2, place: "corner" });
  await mark(row(AMBULANCE).locator("td").first(), { label: 3, place: "corner" });
  await mark(row(AMBULANCE).locator("td").nth(2), { label: 4, place: "corner" });
  await mark(row(WALK_IN).getByRole("button", { name: "トリアージ" }), { label: 5, place: "corner" });
  await mark(row(AMBULANCE).getByRole("button", { name: "診察開始" }), { label: 6, place: "corner" });
  await shot("02-list", { target: [page.locator(".page__header"), table], padding: 24 });
  await clearMarks();

  // トリアージ
  await row(WALK_IN).getByRole("button", { name: "トリアージ" }).click();
  const triage = page.locator(".modal").filter({ hasText: "トリアージ" });
  await triage.getByRole("radio", { name: /^4 / }).click();
  await mark(triage.locator(".jtas-picker"), { label: 1, place: "corner" });
  await mark(triage.getByRole("button", { name: "登録", exact: true }), { label: 2, place: "corner" });
  await shot("03-triage", { target: triage });
  await clearMarks();
  await triage.getByRole("button", { name: "登録", exact: true }).click();
  await triage.waitFor({ state: "detached" });

  // 診察開始 → 転帰
  await page.clock.setSystemTime(at("10:40"));
  await row(AMBULANCE).getByRole("button", { name: "診察開始" }).click();
  await page.locator(".karte-right").waitFor();
  await page.goBack();
  await page.clock.setSystemTime(at("11:50"));
  await row(AMBULANCE).getByRole("button", { name: "転帰" }).click();
  const disposition = page.locator(".modal").filter({ hasText: "退室日時" });
  await labeled(disposition, "転帰").locator("select").selectOption({ label: "入院" });
  await blur(page);
  await mark(labeled(disposition, "転帰"), { label: 1, place: "corner" });
  await mark(labeled(disposition, "退室日時"), { label: 2, place: "corner" });
  await mark(disposition.getByRole("button", { name: "確定" }), { label: 3, place: "corner" });
  await shot("04-disposition", { target: disposition });
  await clearMarks();
  await disposition.getByRole("button", { name: "確定" }).click();

  // 入院予定の登録
  const plan = page.locator(".modal").filter({ hasText: "入院予定の登録" });
  const ward = labeled(plan, "病棟").locator("select");
  await ward.locator("option", { hasText: WARD }).waitFor({ state: "attached" });
  await ward.selectOption({ label: WARD });
  await labeled(plan, "診療科").locator("select").selectOption({ label: "内科" });
  await labeled(plan, "主治医").locator("select").selectOption({ label: DOCTOR });
  await labeled(plan, "入院予定日").locator("input[type=date]").fill(SHOOTING_DATE);
  await labeled(plan, "入院経路").locator("select").selectOption({ label: "家庭からの入院" });
  const priority = labeled(plan, "予定・救急医療入院").locator("select");
  const catheter = await priority.locator("option").filter({ hasText: /^救急.*緊急カテーテル/ }).first().getAttribute("value");
  await priority.selectOption(catheter);
  await plan.getByLabel("救急車による搬送").check();
  await labeled(plan, "特記事項").locator("textarea").fill("急性冠症候群の疑い。");
  await blur(page);
  await settle(plan);
  const submit = plan.getByRole("button", { name: "入院予定登録" });
  await mark(labeled(plan, "病棟"), { label: 1, place: "corner" });
  await mark(labeled(plan, "入院経路"), { label: 2, place: "corner" });
  await mark(labeled(plan, "予定・救急医療入院"), { label: 3, place: "corner" });
  await mark(submit, { label: 4, place: "corner" });
  await shot("05-admission-plan", { target: plan });
  await clearMarks();
  await submit.click();
  await plan.waitFor({ state: "detached" });

  // 転帰を確定した行
  await page.clock.setSystemTime(at("11:55"));
  const admitted = row(AMBULANCE).locator("td").filter({ hasText: /^入院$/ });
  await admitted.waitFor();
  await page.waitForLoadState("networkidle");
  await row(WALK_IN).getByRole("button", { name: "この受診の操作" }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(admitted, { label: 1, place: "corner" });
  await mark(menuItem(page, "来院情報の編集"), { label: 2 });
  await shot("06-disposed", { target: [page.locator(".outpatient__summary, .emergency__summary").first(), table, menu], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cleanUp();
}

/** 救急受付の来院方法・ベッド・担当医・主訴。 */
async function fillArrival(modal, { mode, bed, complaint }) {
  await labeled(modal, "来院方法").locator("select").selectOption({ label: mode });
  await labeled(modal, "ベッド").locator("select").selectOption({ label: bed });
  await labeled(modal, "担当医").locator("select").selectOption({ label: DOCTOR });
  await labeled(modal, "主訴").locator("input").fill(complaint);
}

/** 撮影日の一覧に、撮影用でない患者の行が無いことを確かめる(開発データの滞在中の受診は日をまたいで出る)。 */
async function assertOnlyShootingPatients(table) {
  const names = await table.locator("tbody tr").allInnerTexts();
  const others = names.filter((text) => !text.includes("見本 "));
  if (others.length) throw new Error(`撮影日の救急患者一覧に撮影用でない行があります: ${others.join(" / ")}`);
}

/** 患者の撮影日の救急受診と、トリアージの記録、入院予定を消す。 */
async function removeEmergencyVisits(page, patientIds) {
  const api = await fhirApi(page);
  for (const patientId of patientIds) {
    const encounters = await api.search("Encounter", { patient: patientId, _count: "100" });
    const visits = encounters.filter((e) => e.class?.code === "EMER" && e.period?.start?.startsWith(SHOOTING_DATE));
    const visitIds = new Set(visits.map((e) => e.id));
    const observations = await api.search("Observation", { patient: patientId, _count: "100" });
    for (const observation of observations.filter((o) => visitIds.has(o.encounter?.reference?.split("/").pop()))) {
      await api.remove("Observation", observation.id);
    }
    for (const encounter of encounters.filter((e) => ["planned", "cancelled"].includes(e.status))) {
      await api.remove("Encounter", encounter.id);
    }
    for (const visit of visits) await api.remove("Encounter", visit.id);
  }
}
