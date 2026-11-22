// 操作マニュアル「文書作成」(docs/manual/document.md)
// 外来の「見本 花子」の診療情報提供書(様式)を、カルテの処方を転記して作成する。
// 撮影の前後に、撮影日の文書のカードをカルテから削除して、毎回同じ画面から始める(カードを消すと文書も消える)。
import { blur, dayGroup, deleteAllCards, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const QR_CARD = ".karte-card--qr";
const FEE_CARD = ".karte-card--medical-management-order";
const CATEGORY = "紹介状";
const TEMPLATE = /^診療情報提供書$/;

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(QR_CARD);
  const todaysFees = dayGroup(page, SHOOTING_DATE).locator(FEE_CARD);
  await deleteAllCards(page, todaysCards);
  await deleteAllCards(page, todaysFees);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "文書作成", exact: true }).click();

  // 様式を選ぶ
  const trigger = right.locator(".template-select__trigger");
  await trigger.click();
  const panel = page.locator(".template-select__panel");
  const category = panel.getByRole("menuitem", { name: new RegExp(CATEGORY) });
  await category.click();
  const option = panel.getByRole("menuitemradio", { name: TEMPLATE });
  await option.waitFor();
  await mark(trigger, { label: 1 });
  await mark(category, { label: 2 });
  await mark(option, { label: 3 });
  await shot("01-select", { target: [trigger, panel], padding: 32 });
  await clearMarks();
  await option.click();

  // 様式に入力する
  const sheet = right.getByLabel("紹介先医療機関");
  await sheet.waitFor();
  await page.waitForLoadState("networkidle");
  await right.getByLabel("紹介先医療機関").fill("見本循環器クリニック");
  await right.getByLabel("紹介先診療科").fill("循環器内科");
  await right.getByLabel("紹介先担当医").fill("見本 一郎");
  await right.getByLabel("紹介目的").fill("降圧薬の調整についてご高診をお願いいたします。");
  await blur(page);
  const header = right.getByLabel("表示名");
  await mark(header, { label: 1, place: "corner" });
  await mark(right.getByLabel("診療日"), { label: 2, place: "corner" });
  await mark(right.getByRole("button", { name: "最大化" }), { label: 3, place: "corner" });
  await mark(right.getByLabel("紹介先医療機関"), { label: 4 });
  await mark(right.getByLabel("紹介元医療機関名"), { label: 5 });
  await mark(right.getByRole("button", { name: "作成", exact: true }), { label: 6, place: "corner" });
  await shot("02-form", { target: [right.locator(".template-select__trigger"), right.getByLabel("患者氏名"), right.getByRole("button", { name: "作成", exact: true })], padding: 24 });
  await clearMarks();

  // 転記
  const transfer = right.getByRole("button", { name: "現在の処方に転記" });
  await transfer.scrollIntoViewIfNeeded();
  await mark(transfer, { label: 1, place: "corner" });
  await shot("03-transfer-button", { target: [right.getByLabel("治療経過", { exact: true }), right.getByLabel("現在の処方", { exact: true })], padding: 150 });
  await clearMarks();
  await transfer.click();
  const modal = page.locator(".modal").filter({ hasText: "転記" }).last();
  await modal.waitFor();
  const row = modal.locator(".order-transfer__row").filter({ hasText: "2027/01/04" });
  await row.locator("input[type=checkbox]").check();
  await modal.getByRole("button", { name: /の内容を開く$/ }).first().click();
  await blur(page);
  await mark(modal.getByRole("tab", { name: "処方", exact: true }).locator(".."), { label: 1, place: "corner" });
  await mark(modal.locator("select"), { label: 2, place: "corner" });
  await mark(row, { label: 3 });
  await mark(modal.getByRole("button", { name: "転記", exact: true }), { label: 4, place: "corner" });
  await shot("04-transfer", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "転記", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await blur(page);

  // 作成する
  await right.getByRole("button", { name: "作成", exact: true }).click();

  // 算定(診療情報提供料)
  const claim = page.locator(".modal").filter({ hasText: "算定" }).last();
  await claim.waitFor();
  await mark(claim.getByRole("checkbox").first(), { label: 1 });
  await mark(claim.getByRole("button", { name: "作成", exact: true }), { label: 2, place: "corner" });
  await shot("05-claim", { target: claim });
  await clearMarks();
  await claim.getByRole("button", { name: "作成", exact: true }).click();
  await claim.waitFor({ state: "detached" });

  const card = todaysCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: "PDF を開く" }), { label: 1, place: "corner" });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("06-card", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
  await deleteAllCards(page, todaysFees);
}
