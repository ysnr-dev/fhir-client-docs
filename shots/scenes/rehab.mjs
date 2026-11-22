// 操作マニュアル「リハビリ」(docs/manual/rehab.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、翌日からの廃用症候群リハビリ(理学療法)を登録して撮る。
// 撮影の前後に、この患者のリハビリのカードをカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const rehabCards = page.locator(".karte-card").filter({ hasText: "リハビリ" });
  await deleteAllCards(page, rehabCards);

  // リハビリ登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "リハビリ", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("リハビリ内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");

  // 内容・実施量・期間
  const therapy = fieldset("療法種別");
  const amount = fieldset("実施量");
  const period = fieldset("期間");
  await labeled(content, "疾患別リハ区分").locator("select").selectOption({ label: "廃用症候群リハビリテーション" });
  await therapy.locator("label").filter({ hasText: "理学療法(PT)" }).locator("input").check();
  await labeled(amount, "1回あたりの単位数").locator("input").fill("2");
  await labeled(amount, "週あたりの回数").locator("input").fill("5");
  await labeled(period, "開始日").locator("input").fill(addDays(SHOOTING_DATE, 1));
  await blur(page);
  await mark(labeled(content, "疾患別リハ区分"), { label: 1 });
  await mark(therapy.locator(".rehab-order__therapy-type").first().locator("xpath=.."), { label: 2 });
  await mark(labeled(amount, "1回あたりの単位数"), { label: 3 });
  await mark(labeled(amount, "週あたりの回数"), { label: 4, place: "corner" });
  await mark(labeled(period, "開始日"), { label: 5 });
  await mark(labeled(period, "終了日"), { label: 6, place: "corner" });
  await shot("02-content", { target: [content, period], padding: 40 });
  await clearMarks();

  // 対象と依頼共通
  const target = fieldset("対象");
  const common = fieldset("依頼共通");
  await labeled(target, "対象疾患名").locator("input").fill("廃用症候群");
  await labeled(target, "起算日").locator("input").fill(addDays(SHOOTING_DATE, -4));
  await blur(page);
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(labeled(target, "対象疾患名"), { label: 1 });
  await mark(labeled(target, "起算日"), { label: 2, place: "corner" });
  await mark(labeled(target, "対象プロブレム"), { label: 3, place: "corner" });
  await mark(labeled(common, "入外区分"), { label: 4 });
  await mark(common.getByRole("button", { name: "＋リハ部門への指示" }), { label: 5 });
  await mark(submit, { label: 6 });
  await shot("03-target", { target: [target, submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = rehabCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録したリハビリの操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("04-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, rehabCards);
}
