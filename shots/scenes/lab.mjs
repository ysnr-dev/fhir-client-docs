// 操作マニュアル「検体検査」(docs/manual/lab.md)
// 患者「見本 花子」(撮影用の架空の患者)に、外来伝票から血算と肝・腎の項目を選んで撮影日の検体検査を登録して撮る。
// 撮影の前後に、撮影日のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const ITEMS = ["血算", "AST", "ALT", "Cre"];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(".karte-card");
  await deleteAllCards(page, todaysCards);

  // 検体検査登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "検体検査", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 検査共通
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "対象プロブレム").locator("select").selectOption({ label: "#1 高血圧症" });
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "至急区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "検査日"), { label: 4, place: "corner" });
  await mark(common.getByRole("button", { name: "＋検査コメント" }), { label: 5 });
  await shot("02-common", { target: common, padding: 40 });
  await clearMarks();

  // 検査伝票から選ぶ
  const tabs = form.locator(".order-select__tabs");
  for (const name of ITEMS) await form.getByRole("checkbox", { name, exact: true }).first().check();
  const setRow = form.locator(".order-select__grid tr").filter({ hasText: "生化セット" });
  await blur(page);
  await tabs.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(tabs, { label: 1 });
  await mark(form.locator(".order-select__cell label").filter({ hasText: /^AST$/ }), { label: 2, place: "corner" });
  await mark(setRow, { label: 3 });
  await shot("03-slip", { target: [tabs, setRow], padding: 40 });
  await clearMarks();

  // 選択中の項目
  const selected = form.locator(".order-select__preview");
  await selected.scrollIntoViewIfNeeded();
  await mark(form.locator(".order-select__group").first(), { label: 1 });
  await mark(form.locator(".order-select__remove").first(), { label: 2, place: "corner" });
  await shot("04-selected", { target: selected, padding: 40 });
  await clearMarks();

  // 検査項目検索
  await tabs.getByText("検査項目検索", { exact: true }).click();
  const search = form.locator(".order-select__search input").first();
  await search.fill("CRP");
  const hit = form.locator(".order-select__search-list label").filter({ hasText: "CRP" }).first();
  await hit.waitFor();
  await blur(page);
  await mark(search, { label: 1 });
  await mark(hit, { label: 2 });
  await shot("05-search", { target: [tabs, form.locator(".order-select__search")], padding: 40 });
  await clearMarks();

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("06-submit", { target: [selected, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = todaysCards.filter({ hasText: "検体検査" }).first();
  await card.waitFor();
  await shot("07-card", { target: card });

  // 登録した検体検査の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "検査結果表示"), { label: 2 });
  await mark(menuItem(page, "編集"), { label: 3 });
  await mark(menuItem(page, "削除"), { label: 4 });
  await shot("08-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
