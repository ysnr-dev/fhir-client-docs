// 操作マニュアル「放射線治療」(docs/manual/radiotherapy.md)
// 患者「見本 次郎」(撮影用の架空の患者。結腸癌)に、腰椎転移への緩和照射(プロトコル「骨転移 30Gy/10回」)の治療処方を登録して撮る。
// 撮影の前後に、この患者の放射線治療のカードをカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 次郎";
const PROTOCOL = "骨転移 30Gy/10回";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const rtCards = page.locator(".karte-card").filter({ hasText: "放射線治療" });
  await deleteAllCards(page, rtCards);

  // 放射線治療登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "放射線治療", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const request = fieldset("依頼");
  const course = fieldset("治療コース");
  await course.waitFor();
  await page.waitForLoadState("networkidle");

  // 依頼と治療コース
  await labeled(course, "治療プロトコル").locator("select").selectOption({ label: PROTOCOL });
  await labeled(course, "開始予定日").locator("input").fill(addDays(SHOOTING_DATE, 7));
  await labeled(course, "担当医").locator("select").selectOption({ label: "医師 四郎" });
  await labeled(course, "対象プロブレム").locator("select").selectOption({ label: "#1 結腸癌" });
  await blur(page);
  await mark(labeled(request, "元の他科依頼"), { label: 1 });
  await mark(labeled(course, "治療プロトコル"), { label: 2 });
  await mark(labeled(course, "治療目的"), { label: 3, place: "corner" });
  await mark(labeled(course, "コース番号"), { label: 4 });
  await mark(labeled(course, "開始予定日"), { label: 5, place: "corner" });
  await mark(labeled(course, "併用療法"), { label: 6, place: "corner" });
  await mark(labeled(course, "担当医"), { label: 7, place: "corner" });
  await mark(labeled(course, "対象プロブレム"), { label: 8 });
  await shot("02-course", { target: [request, course], padding: 40 });
  await clearMarks();

  // 標的
  const targets = fieldset("標的");
  await labeled(targets, "部位").locator("select").selectOption({ label: "354 腰椎" });
  await labeled(targets, "補足").locator("input").fill("L3 椎体");
  await blur(page);
  await targets.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(targets, "名称").locator("input, select").first(), { label: 1 });
  await mark(labeled(targets, "種別").locator("input, select").first(), { label: 2 });
  await mark(labeled(targets, "部位").locator("input, select").first(), { label: 3 });
  await mark(labeled(targets, "左右").locator("input, select").first(), { label: 4 });
  await mark(labeled(targets, "補足").locator("input, select").first(), { label: 5 });
  await mark(targets.getByRole("button", { name: "＋標的" }), { label: 6 });
  await shot("03-target", { target: targets, padding: 40 });
  await clearMarks();

  // Phase
  const phases = fieldset("Phase");
  await labeled(phases, "使用予定装置").locator("select").selectOption({ index: 1 });
  await blur(page);
  await phases.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(phases, "名称").locator("input, select").first(), { label: 1 });
  await mark(labeled(phases, "モダリティ").locator("input, select").first(), { label: 2 });
  await mark(labeled(phases, "照射技法").locator("input, select").first(), { label: 3 });
  await mark(labeled(phases, "分割回数").locator("input, select").first(), { label: 4 });
  await mark(labeled(phases, "週あたり回数").locator("input, select").first(), { label: 5 });
  await mark(labeled(phases, "使用予定装置").locator("input, select").first(), { label: 6 });
  await mark(phases.locator("table"), { label: 7 });
  await mark(phases.getByRole("button", { name: "＋Phase" }), { label: 8 });
  await shot("04-phase", { target: phases, padding: 40 });
  await clearMarks();

  // 登録
  const common = fieldset("依頼共通");
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(labeled(common, "入外区分"), { label: 1 });
  await mark(common.getByRole("button", { name: "＋コメント" }), { label: 2 });
  await mark(submit, { label: 3 });
  await shot("05-submit", { target: [common, submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = rtCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録した治療処方の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "週次レビュー"), { label: 2 });
  await mark(menuItem(page, "有害事象"), { label: 3 });
  await mark(menuItem(page, "編集"), { label: 4 });
  await mark(menuItem(page, "削除"), { label: 5 });
  await shot("06-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, rtCards);
}
