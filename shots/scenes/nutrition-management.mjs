// 操作マニュアル「栄養管理」(docs/manual/nutrition-management.md)
// 栄養 桃子(管理栄養士)が栄養管理の画面で見本病棟の入院患者の状況を見て、「見本 秋子」(誤嚥性肺炎・2 型糖尿病)の
// 栄養スクリーニングを書き、栄養管理計画書の記入を始める。撮影の前後に、撮影日に書いた見本 秋子の栄養スクリーニングと
// 栄養管理計画書を消す。
import { blur, fhirApi, labeled, settle } from "../lib/karte.mjs";
import { openDepartmentMenu, patientIdByName } from "../lib/lab.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 秋子";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await page.clock.setSystemTime(new Date(`${SHOOTING_DATE}T13:00:00+09:00`));
  await login("dietitian");
  await cleanUp(page);
  await openDepartmentMenu(page, "栄養部門", "栄養管理");
  const filters = page.locator(".patient-search-form, main").first();
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  const rows = page.locator("tbody tr");
  const row = rows.filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(labeled(filters, "病棟"), { label: 1, place: "corner" });
  await mark(labeled(filters, "対象"), { label: 2, place: "corner" });
  await mark(page.getByText(/^在院/).first().locator("../.."), { label: 3 });
  await mark(row.getByText("未作成").first(), { label: 4, place: "corner" });
  await mark(row.locator("td").nth(-3), { label: 5, place: "corner" });
  await mark(row.locator("td").nth(-2), { label: 6, place: "corner" });
  await shot("01-list", { target: [page.locator(".page__header"), rows.last()], padding: 24 });
  await clearMarks();

  // スクリーニングを書く(カルテの右ペイン)
  await row.getByText("未作成").first().click();
  const form = page.locator(".karte-right form").first();
  await form.locator(".qp-field__label", { hasText: /^身長$/ }).waitFor();
  await page.waitForLoadState("networkidle");
  const field = (title) => form.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: new RegExp(`^${title}`) }) }).first();
  const choose = (title, option) => field(title).locator(".qp-choices__option").filter({ hasText: new RegExp(`^${option}$`) }).locator("input").check();
  await labeled(form, "対象プロブレム").locator("select").selectOption({ label: "#1 誤嚥性肺炎" });
  await field("身長").locator("input").fill("150");
  await field("体重").locator("input").fill("41.0");
  await field("平常時体重").locator("input").fill("45.0");
  await choose("急性疾患の影響", "あり");
  await choose("意図しない体重減少", "あり");
  await choose("低 BMI", "あり");
  await choose("筋肉量の減少", "なし");
  await choose("食事摂取量の減少", "あり");
  await choose("疾病による負荷", "あり");
  await choose("重症度", "中等度");
  await choose("体重の変化", "軽度の減少");
  await choose("食事摂取の変化", "不十分");
  await choose("消化器症状", "なし");
  await choose("身体機能", "歩行可能");
  await choose("疾患と栄養必要量", "中等度");
  await choose("身体所見", "軽度");
  const group = (legend) => form.locator("fieldset.qp-group").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const sga = group("主観的包括的評価");
  const decision = group(/^判定$/);
  await sga.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: /^判定$/ }) }).locator(".qp-choices__option").filter({ hasText: /^中等度の栄養不良$/ }).locator("input").check();
  await field("特別な栄養管理の必要性").locator(".qp-choices__option").filter({ hasText: /^有$/ }).locator("input").check();
  await field("所見").locator("textarea, input").first().fill("入院前から食欲低下があり 3 か月で 4 kg 減少。嚥下調整と経口補助食品の併用を検討");
  await blur(page);

  // 身体計測と MUST
  await group("身体計測").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await settle(form);
  await mark(field("身長"), { label: 1 });
  await mark(field("体重"), { label: 1 });
  await mark(field("平常時体重"), { label: 1 });
  await mark(field("体重減少率"), { label: 2 });
  await mark(field("急性疾患の影響"), { label: 3 });
  await mark(field("栄養リスク"), { label: 4 });
  await shot("02-must", { target: [group("身体計測"), group("栄養スクリーニング")], padding: 40 });
  await clearMarks();

  // GLIM
  const glim = group("低栄養の診断");
  await glim.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(field("意図しない体重減少"), { label: 1 });
  await mark(glim.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: /^判定$/ }) }), { label: 2 });
  await mark(field("重症度"), { label: 3 });
  await shot("03-glim", { target: glim, padding: 40 });
  await clearMarks();

  // SGA と判定・登録
  const submit = form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await submit.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(sga.locator(".qp-field").filter({ has: page.locator(".qp-field__label", { hasText: /^判定$/ }) }), { label: 1 });
  await mark(field("特別な栄養管理の必要性"), { label: 2 });
  await mark(field("所見"), { label: 3 });
  await mark(submit, { label: 4 });
  await shot("04-decision", { target: [sga.locator(".qp-field").last(), submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");

  // 一覧に戻って、計画書の状況を見る
  // 一覧は先に読んだ結果を使い回すので、開き直して読み直す
  await openDepartmentMenu(page, "栄養部門", "栄養管理");
  await page.reload();
  await labeled(filters, "病棟").locator("select").selectOption({ label: "見本病棟" });
  await row.locator("td").filter({ hasText: /中等度|低栄養/ }).first().waitFor();
  await page.waitForLoadState("networkidle");
  await mark(row.locator("td").nth(5), { label: 1, place: "corner" });
  await mark(row.locator("td").nth(7), { label: 2, place: "corner" });
  await mark(row.locator("td").nth(9), { label: 3, place: "corner" });
  await mark(row.locator("td").nth(10), { label: 4, place: "corner" });
  await shot("05-screened", { target: row });
  await clearMarks();
  void decision;

  await cleanUp(page);
}

/** 撮影日に書いた見本 秋子の栄養スクリーニングと栄養管理計画書を消す。 */
async function cleanUp(page) {
  const api = await fhirApi(page);
  const patientId = await patientIdByName(page, PATIENT);
  const responses = await api.search("QuestionnaireResponse", { subject: `Patient/${patientId}`, _count: "200" });
  for (const response of responses) {
    if (!response.authored?.startsWith(SHOOTING_DATE)) continue;
    if (!/nut|NUT/.test(response.questionnaire ?? "")) continue;
    await api.remove("QuestionnaireResponse", response.id);
  }
  void settle;
}
