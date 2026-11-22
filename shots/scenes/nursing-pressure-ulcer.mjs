// 操作マニュアル「褥瘡管理」(docs/manual/nursing-pressure-ulcer.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者)の仙骨部の褥瘡(入院時から保有)を DESIGN-R で評価し、褥瘡管理で見る。
// 撮影の前後に、この患者の DESIGN-R 評価の回答と、回答から作った観察を直接消す。
import { addDays, blur, fhirApi, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId, openNursingMenu } from "../lib/nursing.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const TEMPLATE = "褥瘡 DESIGN-R評価";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeEvaluations(page, patientId);

  // テンプレートを選ぶ
  await openKarte(page, NURSING_PATIENT);
  const pane = page.locator(".karte-right");
  await pane.getByRole("button", { name: "テンプレート", exact: true }).click();
  const trigger = pane.locator(".template-select__trigger");
  await trigger.click();
  const panel = page.locator(".template-select__panel");
  await panel.getByRole("menuitem", { name: /褥瘡/ }).first().click();
  const option = panel.getByRole("menuitemradio", { name: new RegExp(TEMPLATE) });
  await option.waitFor();
  await mark(trigger, { label: 1 });
  await mark(panel.getByRole("menuitem", { name: /褥瘡/ }).first(), { label: 2 });
  await mark(option, { label: 3 });
  await shot("01-select", { target: [trigger, panel], padding: 32 });
  await clearMarks();
  await option.click();

  // 創の情報
  const form = pane.locator("form").first();
  await form.locator(".qp-meta").waitFor();
  await page.waitForLoadState("networkidle");
  const item = (label) => form.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: label }) }).first();
  const choose = async (label, index) => item(label).locator("input[type=radio]").nth(index).check();
  await form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select").selectOption({ label: "(プロブレムなし)" });
  await choose("部位", 0);
  await choose("発生区分", 0);
  await item("発生日").locator("input").fill(addDays(SHOOTING_DATE, -3));
  await choose("状態", 0);
  await choose("深さ", 2);
  await choose("滲出液", 1);
  await choose("大きさ", 2);
  await choose("炎症・感染", 0);
  await choose("肉芽組織", 1);
  await choose("壊死組織", 0);
  await choose("ポケット", 0);
  await item("所見・処置").locator("input, textarea").first().fill("仙骨部に 3×2cm の真皮までの潰瘍。洗浄しハイドロコロイドを貼付。体位変換 2 時間毎");
  await blur(page);
  const wound = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "創" }) }).first();
  await wound.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(item("部位"), { label: 1, place: "corner" });
  await mark(item("発生区分"), { label: 2, place: "corner" });
  await mark(item("発生日"), { label: 3, place: "corner" });
  await mark(item("状態"), { label: 4, place: "corner" });
  await shot("02-wound", { target: wound });
  await clearMarks();

  // DESIGN-R
  const designR = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "DESIGN-R" }) }).first();
  await designR.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(item("深さ"), { label: 1, place: "corner" });
  await mark(item("合計"), { label: 2, place: "corner" });
  await mark(item("重症度"), { label: 3, place: "corner" });
  await shot("03-design-r", { target: designR });
  await clearMarks();
  const submit = form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await submit.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 褥瘡管理
  await openNursingMenu(page, "褥瘡管理");
  const table = page.locator("table").first();
  const row = table.getByRole("row").filter({ hasText: NURSING_PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  const cell = (index) => row.locator("td").nth(index);
  await mark(cell(6), { label: 1, place: "corner" });
  await mark(cell(7), { label: 2, place: "corner" });
  await mark(cell(8), { label: 3, place: "corner" });
  await mark(row.getByRole("button", { name: "経過" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "評価" }), { label: 5, place: "corner" });
  await mark(row.getByRole("button", { name: "チーム依頼" }), { label: 6, place: "corner" });
  await shot("04-list", { target: [page.getByRole("tab", { name: "保有患者" }), table] });
  await clearMarks();

  // 経過
  await row.getByRole("button", { name: "経過" }).click();
  const course = page.locator(".modal").last();
  await course.waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await shot("05-course", { target: course });
  await course.locator(".modal__close").click();

  // 発生率
  await page.getByRole("tab", { name: "発生率" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shot("06-rate", { target: [page.getByRole("tab", { name: "保有患者" }), page.getByText("褥瘡有病率").first(), page.locator("table").first()], padding: 24 });

  await removeEvaluations(page, patientId);
}

/** 看護の患者の DESIGN-R 評価の回答と、回答から作った観察を消す。撮影用データには無いので、すべて消してよい。 */
async function removeEvaluations(page, patientId) {
  const api = await fhirApi(page);
  const responses = (await api.search("QuestionnaireResponse", { patient: patientId, _count: "500" })).filter((r) =>
    /designr|DESIGNR|pressure-ulcer/i.test(r.questionnaire ?? ""),
  );
  for (const response of responses) {
    const derived = await api.search("Observation", { "derived-from": `QuestionnaireResponse/${response.id}`, _count: "500" });
    for (const observation of derived.filter((o) => o.derivedFrom?.some((r) => r.reference === `QuestionnaireResponse/${response.id}`))) {
      await api.remove("Observation", observation.id);
    }
    await api.remove("QuestionnaireResponse", response.id);
  }
}
