// 操作マニュアル「指導・管理料」(docs/manual/medical-management.md)
// 外来の患者「見本 花子」(撮影用の架空の患者。高血圧症で通院)に、撮影日の特定疾患療養管理料を登録して撮る。
// 撮影の前後に、撮影日のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const ITEM = "特定疾患療養管理料";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(".karte-card");
  await deleteAllCards(page, todaysCards);

  // 指導・管理料登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "指導・管理料", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const items = fieldset("算定項目");
  await items.waitFor();
  await page.waitForLoadState("networkidle");

  // 算定項目
  const row = items.locator(".medical-management-form__items > li").filter({ hasText: ITEM }).first();
  await row.locator("input[type=checkbox]").first().check();
  await blur(page);
  const lifestyle = items.locator(".medical-management-form__items > li").filter({ hasText: "生活習慣病管理料２" }).first();
  await mark(row.locator(".medical-management-form__item").first(), { label: 1 });
  await mark(row.locator(".medical-management-form__history").first(), { label: 2, place: "corner" });
  const additions = row.locator(".medical-management-form__additions");
  if (await additions.count()) await mark(additions, { label: 3 });
  await mark(lifestyle.locator(".medical-management-form__history").last(), { label: 4, place: "corner" });
  await shot("02-items", { target: [items.locator("legend"), lifestyle], padding: 40 });
  await clearMarks();

  // 算定日と登録
  const date = fieldset("算定日");
  const common = fieldset("依頼共通");
  await labeled(date, "対象プロブレム").locator("select").selectOption({ label: "#1 高血圧症" });
  await blur(page);
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(labeled(date, "算定日"), { label: 1 });
  await mark(labeled(date, "対象プロブレム"), { label: 2, place: "corner" });
  await mark(labeled(common, "入外区分"), { label: 3 });
  await mark(common.getByRole("button", { name: "＋備考" }), { label: 4 });
  await mark(submit, { label: 5 });
  await shot("03-date", { target: [date, submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = todaysCards.filter({ hasText: ITEM }).first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録した指導・管理料の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("04-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
