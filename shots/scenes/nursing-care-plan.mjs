// 操作マニュアル「看護計画・看護診断」(docs/manual/nursing-care-plan.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。誤嚥性肺炎)に標準看護計画「誤嚥の予防」で看護計画を立て、評価する。
// 撮影の前後に、この患者の看護計画(看護問題・計画・目標・評価)を直接消す。
import { blur, fhirApi, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId, removeShootingDayNursing } from "../lib/nursing.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeCarePlans(page, patientId);
  await removeShootingDayNursing(page, patientId);

  // 標準看護計画を選ぶ
  await openKarte(page, NURSING_PATIENT);
  const pane = page.locator(".karte-right");
  await pane.locator(".karte-right__group-toggle", { hasText: "看護" }).click();
  await pane.getByRole("button", { name: "看護計画", exact: true }).click();
  await pane.getByRole("button", { name: "標準看護計画", exact: true }).click();
  const picker = page.locator(".modal").filter({ hasText: "標準看護計画を選択" }).last();
  await picker.waitFor();
  await page.waitForLoadState("networkidle");
  await picker.locator("input").first().fill("誤嚥");
  const result = picker.getByText("誤嚥の予防").first();
  await result.waitFor();
  await blur(page);
  await mark(picker.locator("input").first(), { label: 1, place: "corner" });
  await mark(result, { label: 2, place: "corner" });
  await shot("01-picker", { target: [picker.locator(".modal__header"), result], padding: 24 });
  await clearMarks();
  await result.click();
  await picker.waitFor({ state: "detached" });

  // 看護問題と因子
  const form = pane.locator("form").first();
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  await fieldset("因子").getByRole("checkbox").nth(0).check();
  await fieldset("因子").getByRole("checkbox").nth(1).check();
  await blur(page);
  await fieldset("看護問題").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(form.getByRole("button", { name: "標準看護計画" }), { label: 1, place: "corner" });
  await mark(form.locator("label").filter({ hasText: /^名称/ }).first(), { label: 2, place: "corner" });
  await mark(form.locator("label").filter({ hasText: /^立案日/ }).first(), { label: 3, place: "corner" });
  await mark(fieldset("因子"), { label: 4, place: "corner" });
  await shot("02-problem", { target: [fieldset("看護問題"), fieldset("因子")] });
  await clearMarks();

  // 目標と OP/TP/EP
  const goal = fieldset("目標");
  await goal.locator("input[type=date]").first().fill("2027-02-08");
  await blur(page);
  // 注釈を付けるたびに枠の中がスクロールしないよう、目標の欄を先に上端に合わせる。
  await goal.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(goal.locator("input[type=text], input:not([type])").first(), { label: 1, place: "corner" });
  await mark(goal.locator("input[type=date]").first(), { label: 2, place: "corner" });
  await mark(fieldset("OP"), { label: 3, place: "corner" });
  await mark(fieldset("TP"), { label: 4, place: "corner" });
  await mark(fieldset("EP"), { label: 5, place: "corner" });
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await mark(submit, { label: 6, place: "corner" });
  await shot("03-plan", { target: [goal, submit] });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 看護計画タブ
  const tabGroup = page.locator(".karte-tabs__group").filter({ hasText: "看護" });
  await tabGroup.locator(".karte-tabs__tab").hover();
  await page.locator(".karte-tabs__menu").getByText("看護計画", { exact: true }).click();
  await page.mouse.move(960, 1000);
  const panel = page.locator(".karte-left .karte-tabpanel");
  await panel.getByText("誤嚥の危険がある状態").first().waitFor();
  await page.waitForLoadState("networkidle");
  const card = panel.locator("section, article, div").filter({ has: page.getByRole("button", { name: "評価" }) }).last();
  await mark(panel.getByRole("button", { name: "標準看護計画" }), { label: 1, place: "corner" });
  await mark(panel.getByRole("button", { name: "看護診断（NANDA）" }), { label: 2, place: "corner" });
  await mark(panel.getByRole("button", { name: "評価" }), { label: 3, place: "corner" });
  await mark(panel.getByRole("button", { name: "指示展開" }), { label: 4, place: "corner" });
  await mark(panel.locator("button", { hasText: "↑" }).first(), { label: 5, place: "corner" });
  await mark(panel.locator(".row-menu__trigger").first(), { label: 6, place: "corner" });
  await shot("04-tree", { target: [panel.getByText("看護計画", { exact: true }).first(), panel.getByText("食べ方と姿勢を説明する")], padding: 24 });
  await clearMarks();

  // 評価
  await panel.getByRole("button", { name: "評価" }).click();
  const evaluation = page.locator(".modal").filter({ hasText: "評価" }).last();
  await evaluation.waitFor();
  const goalBox = evaluation.locator("fieldset").first();
  await goalBox.locator("select").selectOption({ label: "改善" });
  await goalBox.locator("textarea").fill("とろみ付きの水分でむせが減った。食事は全量摂取");
  await evaluation.locator("textarea").last().fill("嚥下訓練を続け、食形態の変更は次回の評価で判断する");
  await blur(page);
  await mark(evaluation.locator("label").filter({ hasText: /^評価日/ }).first(), { label: 1, place: "corner" });
  await mark(goalBox, { label: 2, place: "corner" });
  await mark(evaluation.locator("fieldset").last(), { label: 3, place: "corner" });
  const evaluationSubmit = evaluation.getByRole("button", { name: "登録", exact: true });
  await mark(evaluationSubmit, { label: 4, place: "corner" });
  await shot("05-evaluate", { target: evaluation });
  await clearMarks();
  await evaluationSubmit.click();
  await evaluation.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 指示展開
  await panel.getByRole("button", { name: "指示展開" }).click();
  const expand = page.locator(".modal").filter({ hasText: "指示展開" }).last();
  await expand.waitFor();
  // 体温と口腔清拭は指示が出ているので、むせ・嚥下訓練だけを展開する。
  for (const index of [1, 2, 3, 5]) await expand.getByRole("checkbox").nth(index).uncheck();
  await mark(expand.getByRole("checkbox").first(), { label: 1 });
  await mark(expand.getByRole("button", { name: "次へ" }), { label: 2, place: "corner" });
  await shot("06-expand", { target: expand });
  await clearMarks();
  await expand.getByRole("button", { name: "次へ" }).click();
  const lines = expand.locator(".nursing-order-form__line");
  await lines.nth(1).waitFor();
  await lines.nth(0).getByLabel("頻度").selectOption({ label: "1日3回" });
  await lines.nth(0).getByLabel("条件").fill("食事時");
  await lines.nth(1).getByLabel("頻度").selectOption({ label: "1日1回" });
  await blur(page);
  await mark(lines.nth(0).locator(".nursing-order-form__item"), { label: 1, place: "corner" });
  await mark(lines.nth(0).locator(".nursing-order-form__schedule"), { label: 2, place: "corner" });
  await shot("07-expand-form", { target: lines.nth(0) });
  await clearMarks();
  const expandSubmit = expand.getByRole("button", { name: "登録", exact: true });
  await expandSubmit.click();
  await expand.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 指示簿に出た指示
  await tabGroup.locator(".karte-tabs__tab").hover();
  await page.locator(".karte-tabs__menu").getByText("指示簿", { exact: true }).click();
  await page.mouse.move(960, 1000);
  const expanded = panel.getByRole("row").filter({ hasText: "むせ" }).first();
  await expanded.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(expanded.getByText("看護計画").first(), { label: 1, place: "corner" });
  await shot("08-orders", { target: panel.locator("table").first() });
  await clearMarks();

  // 看護診断(NANDA)
  await pane.getByRole("button", { name: "看護診断", exact: true }).click();
  const diagnosisForm = pane.locator("form").first();
  await diagnosisForm.waitFor();
  await page.waitForTimeout(500);
  await diagnosisForm.getByRole("button", { name: "看護診断（NANDA）" }).click();
  const diagnosisPicker = page.locator(".modal").last();
  await diagnosisPicker.waitFor();
  await diagnosisPicker.locator("input").first().fill("痰");
  const diagnosis = diagnosisPicker.getByText("痰をうまく出せない状態").first();
  await diagnosis.waitFor();
  await diagnosis.click();
  await diagnosisPicker.waitFor({ state: "detached" });
  const diagnosisFieldset = (legend) =>
    diagnosisForm.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  await diagnosisFieldset("因子").getByRole("checkbox").nth(0).check();
  await diagnosisFieldset("因子").getByRole("checkbox").nth(3).check();
  await blur(page);
  await diagnosisFieldset("看護問題").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(diagnosisFieldset("看護問題").locator(".chip, [class*=tag], [class*=chip]").first(), { label: 1, place: "corner" });
  await mark(diagnosisFieldset("因子"), { label: 2, place: "corner" });
  await mark(diagnosisFieldset("標準看護計画"), { label: 3, place: "corner" });
  await shot("09-nanda", { target: [diagnosisFieldset("看護問題"), diagnosisFieldset("標準看護計画")] });
  await clearMarks();
  const noc = diagnosisFieldset("目標");
  const nic = diagnosisFieldset("看護介入");
  await mark(noc.getByRole("button", { name: "成果" }), { label: 1, place: "corner" });
  await mark(nic.getByRole("button", { name: "介入追加" }), { label: 2, place: "corner" });
  await shot("10-noc-nic", { target: [noc, diagnosisForm.getByRole("button", { name: "登録", exact: true })] });
  await clearMarks();
  await pane.getByRole("button", { name: "閉じる" }).click();

  await removeCarePlans(page, patientId);
  await removeShootingDayNursing(page, patientId);
}

/** 看護の患者の看護計画(評価の記録・目標・計画・看護問題)を消す。撮影用データには看護問題が無いので、すべて消してよい。 */
async function removeCarePlans(page, patientId) {
  const api = await fhirApi(page);
  const problems = (await api.search("Condition", { patient: patientId, _count: "500" })).filter((condition) =>
    condition.category?.some((c) => c.coding?.some((coding) => coding.code === "nursing-problem")),
  );
  if (problems.length === 0) return;
  const plans = await api.search("CarePlan", { patient: patientId, _count: "500" });
  const goals = await api.search("Goal", { patient: patientId, _count: "500" });
  const ids = [...problems, ...plans, ...goals].map((r) => r.id);
  const observations = (await api.search("Observation", { patient: patientId, _count: "500" })).filter((o) =>
    ids.some((id) => JSON.stringify(o).includes(id)),
  );
  for (const observation of observations) await api.remove("Observation", observation.id);
  for (const plan of plans) await api.remove("CarePlan", plan.id);
  for (const goal of goals) await api.remove("Goal", goal.id);
  for (const problem of problems) await api.remove("Condition", problem.id);
}
