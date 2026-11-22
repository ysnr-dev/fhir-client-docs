// 操作マニュアル「内視鏡」(docs/manual/endoscopy.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、上部内視鏡(経口)を日付未定で登録して撮る。
// 検査目的は JED 用語のテンプレートで記入する。開発環境には内視鏡室の予約枠が無いので、予約は撮らない(放射線検査・生理検査のページで撮る)。
// 撮影の前後に、この患者の内視鏡のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";

const PATIENT = "見本 太郎";
const ITEM = "EGD(経口)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const endoscopyCards = page.locator(".karte-card").filter({ hasText: "内視鏡" });
  await deleteAllCards(page, endoscopyCards);

  // 内視鏡登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "内視鏡", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 検査共通とオーダー項目
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  const tabs = form.locator(".order-select__tabs");
  const item = form.locator(".order-select__cell label").filter({ hasText: new RegExp(`^${ITEM.replace(/[()]/g, "\\$&")}$`) });
  await item.locator("input").check();
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(tabs, { label: 3 });
  await mark(item, { label: 4, place: "corner" });
  await shot("02-items", { target: [common, form.locator(".order-select__grid tr").nth(2)], padding: 40 });
  await clearMarks();

  // 検査目的のテンプレート
  const frame = form.locator(".rad-order-frame").first();
  await frame.locator(".rad-order-frame__undated input").check();
  await frame.locator('input[aria-label="依頼病名"]').fill("胃癌の疑い");
  await labeled(frame, "検査目的").getByRole("button", { name: "テンプレート" }).click();
  const template = page.locator(".modal").filter({ hasText: "テンプレート記載" }).last();
  const purpose = labeled(template, "検査目的").locator("select");
  await purpose.waitFor();
  await purpose.selectOption({ label: "吐・下血以外の有症状" });
  await labeled(template, "補足").locator("input").fill("心窩部痛が続く");
  await blur(page);
  await mark(template.locator(".template-select"), { label: 1 });
  await mark(labeled(template, "検査目的"), { label: 2 });
  await mark(labeled(template, "治療目的"), { label: 3 });
  await mark(labeled(template, "補足"), { label: 4 });
  await mark(template.getByRole("button", { name: "記載反映" }), { label: 5 });
  await shot("03-purpose", { target: template });
  await clearMarks();
  await template.getByRole("button", { name: "記載反映" }).click();
  await template.waitFor({ state: "detached" });

  // 選んだ項目(オーダーの枠)
  await blur(page);
  await frame.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(frame, "至急区分"), { label: 1, place: "corner" });
  await mark(frame.locator(".rad-order-frame__booking").getByRole("button", { name: "予約" }), { label: 2, place: "corner" });
  await mark(frame.locator(".rad-order-frame__undated"), { label: 3, place: "corner" });
  await mark(labeled(frame, "依頼病名"), { label: 4 });
  await mark(labeled(frame, "検査目的"), { label: 5 });
  await mark(labeled(frame, "特別指示"), { label: 6 });
  await shot("04-frame", { target: frame, padding: 40 });
  await clearMarks();

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("05-submit", { target: [frame.locator(".rad-order-frame__foot"), submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = endoscopyCards.first();
  await card.waitFor();
  const undatedGroup = page.locator(".karte-group").filter({ has: card });
  await shot("06-card", { target: undatedGroup });

  // 登録した内視鏡の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("07-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, endoscopyCards);
}
