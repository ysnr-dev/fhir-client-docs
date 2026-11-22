// 操作マニュアル「テンプレート」(docs/manual/template.md)
// 外来の「見本 花子」に、基礎データのテンプレート「社会歴」を記入して登録する。
// 2 回目に同じテンプレートを開くと出る「前回値複写」も撮る。
// 撮影の前後に、撮影日のテンプレートのカードをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const QR_CARD = ".karte-card--qr";
const CATEGORY = "基礎データ";
const TEMPLATE = /^社会歴/;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(QR_CARD);
  await deleteAllCards(page, todaysCards);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "テンプレート", exact: true }).click();

  // テンプレートを選ぶ
  const trigger = right.locator(".template-select__trigger");
  await trigger.click();
  const panel = page.locator(".template-select__panel");
  await panel.getByRole("menuitem", { name: new RegExp(CATEGORY) }).click();
  const option = panel.getByRole("menuitemradio", { name: TEMPLATE });
  await option.waitFor();
  await mark(trigger, { label: 1 });
  await mark(panel.getByRole("menuitem", { name: new RegExp(CATEGORY) }), { label: 2 });
  await mark(option, { label: 3 });
  await shot("01-select", { target: [trigger, panel], padding: 32 });
  await clearMarks();
  await option.click();

  // 記入する
  const form = right.locator("form").first();
  const meta = form.locator(".qp-meta");
  await meta.waitFor();
  await page.waitForLoadState("networkidle");
  await form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select").selectOption({ label: "#1 高血圧症" });
  await radio(form, "喫煙歴", "無");
  await radio(form, "飲酒歴", "有");
  const occupation = form.locator(".qp-field").filter({ hasText: "職業歴" }).locator("input[type=text], textarea").first();
  await occupation.fill("事務職");
  await blur(page);
  // 右ペインの中は先頭から喫煙歴まで画面に収まるので、スクロールさせずに枠を付ける(スクロールすると枠がずれる)。
  const smoking = itemOf(form, "喫煙歴");
  const problem = form.locator(".qp-field").filter({ hasText: "対象プロブレム" }).locator("select");
  await mark(meta.locator("summary"), { label: 1 });
  await mark(problem, { label: 2 });
  await mark(smoking, { label: 3 });
  await shot("02-form", { target: [trigger, smoking], padding: 32 });
  await clearMarks();

  // 登録する
  const submit = form.locator(".prescription-form__submit").getByRole("button", { name: "登録", exact: true });
  await submit.click();
  const card = todaysCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(menuItem(page, "詳細表示"), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("03-card", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 2 回目: 前回の回答を写す
  await right.getByRole("button", { name: "テンプレート", exact: true }).click();
  await trigger.click();
  await panel.getByRole("menuitem", { name: new RegExp(CATEGORY) }).click();
  await panel.getByRole("menuitemradio", { name: TEMPLATE }).click();
  const copy = right.locator(".qr-copy-previous");
  await copy.waitFor();
  await blur(page);
  await mark(copy, { label: 1 });
  await shot("04-copy", { target: [trigger, copy], padding: 32 });
  await clearMarks();
  await right.getByRole("button", { name: "閉じる" }).click();

  await deleteAllCards(page, todaysCards);
}

/** テンプレートの 1 問(設問の文字と回答の欄)。 */
function itemOf(form, text) {
  return form.locator(".qp-field").filter({ hasText: text }).last();
}

/** 選択肢の設問で、選択肢を選ぶ。 */
async function radio(form, question, choice) {
  await itemOf(form, question).getByLabel(choice, { exact: true }).check();
}
