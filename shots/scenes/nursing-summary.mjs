// 操作マニュアル「看護サマリー」(docs/manual/nursing-summary.md)
// 看護 次郎が「見本 秋子」(撮影用の架空の患者)の中間の看護サマリーを書いて確定し、看護 夏子が看護サマリー承認で承認する。
// 撮影の前後に、この患者の看護サマリーを直接消す。
import { blur, fhirApi, logout, openKarte } from "../lib/karte.mjs";
import { NURSING_PATIENT, nursingPatientId, openNursingMenu } from "../lib/nursing.mjs";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  const patientId = await nursingPatientId(page);
  await removeSummaries(page, patientId);

  // 看護サマリーを開く
  await openKarte(page, NURSING_PATIENT);
  const pane = page.locator(".karte-right");
  await pane.locator(".karte-right__group-toggle", { hasText: "看護" }).click();
  await pane.getByRole("button", { name: "看護サマリー", exact: true }).click();
  const body = pane.locator(".karte-right__body");
  await body.getByRole("button", { name: "確定", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const section = (title) =>
    body.locator(".discharge-summary__section").filter({ has: page.locator("h3", { hasText: title }) }).first();
  const write = async (title, text) => {
    const editor = section(title).locator("[contenteditable]").first();
    await editor.click();
    await page.keyboard.type(text);
  };
  await write("看護経過", "入院時 38.4℃、SpO2 92%。抗菌薬の点滴で解熱し、2/1 は 36.9℃。食事時のむせがあり、とろみ付きの水分で全量摂取できている。");
  await write("現在の状態", "病棟内は付き添いで歩行。口腔清拭は介助で 1 日 3 回。");
  await write("継続看護", "食事時のむせの観察と嚥下訓練を続ける。血糖は 1 日 4 回測定。");
  await blur(page);

  // 入院情報と基本情報
  const info = body.locator("fieldset").filter({ has: page.locator("legend", { hasText: "入院情報" }) }).first();
  await info.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(info.locator("label").filter({ hasText: /^種別/ }).first(), { label: 1, place: "corner" });
  await mark(info.locator("label").filter({ hasText: /^期間/ }).first(), { label: 2, place: "corner" });
  await mark(body.getByRole("button", { name: "再収集" }), { label: 3, place: "corner" });
  await mark(section("基本情報").locator("[contenteditable]").first(), { label: 4, place: "corner" });
  await shot("01-info", { target: [body.locator("label").filter({ hasText: /^対象の入院/ }).first(), section("基本情報")] });
  await clearMarks();

  // 病名・看護問題と看護経過
  const diseases = body.getByLabel("#1 誤嚥性肺炎");
  await section("病名").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(diseases.locator(".."), { label: 1, place: "corner" });
  await mark(section("看護問題・計画"), { label: 2, place: "corner" });
  await mark(body.getByRole("button", { name: "取込" }), { label: 3, place: "corner" });
  await mark(section("看護経過").locator("[contenteditable]").first(), { label: 4, place: "corner" });
  await shot("02-content", { target: [section("病名"), section("看護経過")] });
  await clearMarks();

  // 保存と確定
  const confirm = body.getByRole("button", { name: "確定", exact: true });
  await confirm.scrollIntoViewIfNeeded();
  await mark(section("現在の状態").locator("[contenteditable]").first(), { label: 1, place: "corner" });
  await mark(section("継続看護").locator("[contenteditable]").first(), { label: 2, place: "corner" });
  await mark(body.getByRole("button", { name: "保存", exact: true }), { label: 3, place: "corner" });
  await mark(confirm, { label: 4, place: "corner" });
  await shot("03-submit", { target: [section("現在の状態"), confirm], padding: 40 });
  await clearMarks();
  await confirm.click();
  await confirm.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await logout(page);

  // 承認する
  await login("headNurse");
  await openNursingMenu(page, "看護サマリー承認");
  const table = page.locator("table").first();
  const row = table.getByRole("row").filter({ hasText: NURSING_PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  const filter = (text) => page.locator("label").filter({ hasText: new RegExp(`^${text}`) }).first();
  await mark(filter("病棟"), { label: 1, place: "corner" });
  await mark(filter("状態"), { label: 2, place: "corner" });
  await mark(row.getByText("開く", { exact: true }), { label: 3, place: "corner" });
  await mark(row.getByRole("button", { name: "承認" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: "却下" }), { label: 5, place: "corner" });
  await shot("04-approvals", { target: [page.locator(".page__header"), table] });
  await clearMarks();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "承認" }).click();
  await page.waitForLoadState("networkidle");
  await filter("状態").locator("select").selectOption({ label: "すべて" });
  await row.getByText("承認済").waitFor();
  await page.waitForLoadState("networkidle");
  await shot("05-approved", { target: table });

  await removeSummaries(page, patientId);
}

/** 看護の患者の看護サマリーを消す。撮影用データには無いので、すべて消してよい。 */
async function removeSummaries(page, patientId) {
  const api = await fhirApi(page);
  const summaries = (await api.search("Composition", { patient: patientId, _count: "500" })).filter((c) =>
    c.type?.coding?.some((coding) => coding.code === "nursing-summary"),
  );
  for (const summary of summaries) {
    for (const task of await api.search("Task", { focus: `Composition/${summary.id}` })) await api.remove("Task", task.id);
    await api.remove("Composition", summary.id);
  }
}
