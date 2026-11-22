// 操作マニュアル「処置」(docs/manual/treatment.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、病棟で行った創傷処置を即実施(実施入力つき)で登録して撮る。
// 実施済の処置は画面から削除できないので、撮影の前後にこの患者のオーダーと実施記録を直接消す。
import { blur, dayGroup, labeled, menuItem, openKarte, patientIdOf, removeOrdersOf } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const ITEM = "創処置<100";
const COMMENT = "創部の発赤・滲出液なし。洗浄し被覆材を交換";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  const cleanUp = () =>
    removeOrdersOf(page, patientId, [
      ["MedicationAdministration", () => true],
      ["Procedure", () => true],
    ]);
  await cleanUp();
  await page.reload();
  const pane = page.locator(".karte-right");
  await pane.waitFor();

  // 処置登録を開く
  const paneButton = pane.getByRole("button", { name: "処置", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 処置共通と処置項目
  const form = pane.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  const tabs = form.locator(".order-select__tabs");
  const item = form.locator(".order-select__cell label").filter({ hasText: ITEM });
  await item.locator("input").check();
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(tabs, { label: 3 });
  await mark(item, { label: 4, place: "corner" });
  await shot("02-items", { target: [common, form.locator(".order-select__grid tr").nth(2)], padding: 40 });
  await clearMarks();

  // 実施日と即実施
  const frame = form.locator(".rad-order-frame").first();
  const perform = frame.locator(".rad-order-frame__perform");
  await perform.locator("input").check();
  const performButton = frame.getByRole("button", { name: "実施入力" });
  await performButton.waitFor();
  await blur(page);
  await frame.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(frame, "実施日"), { label: 1, place: "corner" });
  await mark(labeled(frame, "実施時刻"), { label: 2, place: "corner" });
  await mark(frame.locator(".rad-gp__head"), { label: 3 });
  await mark(perform, { label: 4 });
  await mark(performButton, { label: 5, place: "corner" });
  await shot("03-frame", { target: frame, padding: 40 });
  await clearMarks();

  // 実施入力
  await performButton.click();
  const modal = page.locator(".modal").filter({ hasText: "実施内容確定" }).last();
  await modal.waitFor();
  await labeled(modal, "実施コメント").locator("textarea").fill(COMMENT);
  await blur(page);
  await mark(labeled(modal, "実施時刻"), { label: 1, place: "corner" });
  await mark(labeled(modal, "実施者"), { label: 2, place: "corner" });
  await mark(modal.getByRole("button", { name: "診療行為追加" }).locator("xpath=.."), { label: 3 });
  await mark(modal.getByRole("button", { name: "薬剤追加" }).locator("xpath=.."), { label: 4 });
  await mark(modal.getByRole("button", { name: "器材追加" }).locator("xpath=.."), { label: 5 });
  await mark(labeled(modal, "実施コメント"), { label: 6 });
  await mark(modal.getByRole("button", { name: "実施内容確定" }), { label: 7 });
  await shot("04-perform", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "実施内容確定" }).click();
  await modal.waitFor({ state: "detached" });

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await blur(page);
  await submitArea.scrollIntoViewIfNeeded();
  await mark(frame.locator(".rad-order-frame__foot"), { label: 1 });
  await mark(submit, { label: 2 });
  await shot("05-submit", { target: [frame.locator(".rad-order-frame__foot"), submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = dayGroup(page, SHOOTING_DATE).locator(".karte-card").filter({ hasText: "処置" }).first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("06-card", { target: card });

  // 登録した処置の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("07-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cleanUp();
}
