// 操作マニュアル「看護プロファイル」(docs/manual/nursing-profile.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者。撮影日の 3 日前に入院)の看護プロファイルの「入院時情報」を書く。
// 撮影の前後に、この患者の入院に結び付いた回答(看護プロファイル)を直接消す。
import { blur, fhirApi, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId } from "../lib/nursing.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeProfiles(page, patientId);

  // プロファイルを開く
  await openKarte(page, NURSING_PATIENT);
  const pane = page.locator(".karte-right");
  await pane.locator(".karte-right__group-toggle", { hasText: "看護" }).click();
  await pane.getByRole("button", { name: "プロファイル", exact: true }).click();
  const body = pane.locator(".karte-right__body");
  const sectionButton = (name) => body.getByRole("button", { name: new RegExp(`^${name}`) }).first();
  await sectionButton("入院時情報").waitFor();
  const group = (legend) => body.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  await group("入院の経緯").waitFor();
  await page.waitForLoadState("networkidle");

  // 入院時情報を書く
  const history = group("入院の経緯");
  const choose = (text) => history.locator("label").filter({ hasText: new RegExp(`^${text}$`) }).locator("input").first().check();
  await choose("救急外来から");
  await choose("車椅子");
  await history.locator("textarea").first().fill("1/28 夜から 38℃台の発熱と湿性の咳。食事のたびにむせるようになり、1/29 に救急外来を受診して入院");
  await choose("本人");
  await choose("家族");
  await blur(page);
  await body.locator("label").filter({ hasText: /^対象の入院/ }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(body.locator("label").filter({ hasText: /^対象の入院/ }).first(), { label: 1, place: "corner" });
  await mark(sectionButton("入院時情報").locator(".."), { label: 2, place: "corner" });
  await mark(history, { label: 3, place: "corner" });
  await shot("01-form", { target: [body.locator("label").filter({ hasText: /^対象の入院/ }).first(), history] });
  await clearMarks();

  const submit = body.getByRole("button", { name: "登録", exact: true });
  await submit.click();
  await submit.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 看護プロファイルタブ
  const tabGroup = page.locator(".karte-tabs__group").filter({ hasText: "看護" });
  const tabMenuItem = page.locator(".karte-tabs__menu").getByText("看護プロファイル", { exact: true });
  // 登録の直後はタブのメニューが開かないことがあるので、マウスを外して乗せ直す。
  for (let i = 0; i < 5 && !(await tabMenuItem.isVisible()); i++) {
    await page.mouse.move(960, 1000);
    await page.waitForTimeout(500);
    await tabGroup.locator(".karte-tabs__tab").hover();
    await tabMenuItem.waitFor({ timeout: 1000 }).catch(() => {});
  }
  await tabMenuItem.click();
  await page.mouse.move(960, 1000);
  const panel = page.locator(".karte-left .karte-tabpanel");
  await panel.getByText("救急外来から").first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(panel.locator("select").first(), { label: 1, place: "corner" });
  await mark(panel.getByRole("button", { name: "編集" }).first(), { label: 2, place: "corner" });
  await mark(panel.getByRole("button", { name: "記入" }).first(), { label: 3, place: "corner" });
  await shot("02-tab", { target: [panel.locator("select").first(), panel.getByRole("button", { name: "記入" }).last(), panel.getByText("入院時情報", { exact: true }).first()], padding: 24 });
  await clearMarks();

  // 記入済みの区画
  await panel.getByRole("button", { name: "編集" }).first().click();
  await body.locator("button", { hasText: "入院時情報" }).filter({ hasText: "済" }).first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(sectionButton("入院時情報"), { label: 1, place: "corner" });
  await mark(sectionButton("転倒・転落リスク"), { label: 2, place: "corner" });
  await shot("03-sections", { target: [body.locator("label").filter({ hasText: /^対象の入院/ }).first(), sectionButton("褥瘡リスク")] });
  await clearMarks();

  await removeProfiles(page, patientId);
}

/** 看護の患者の、入院に結び付いた回答(看護プロファイル)を消す。撮影用データには無いので、すべて消してよい。 */
async function removeProfiles(page, patientId) {
  const api = await fhirApi(page);
  const responses = await api.search("QuestionnaireResponse", { patient: patientId, _count: "500" });
  for (const response of responses.filter((r) => r.encounter)) await api.remove("QuestionnaireResponse", response.id);
}
