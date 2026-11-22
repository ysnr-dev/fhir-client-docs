// 操作マニュアル「クリニカルパス」(docs/manual/clinical-pathway.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者。早期胃癌)に、胃 ESD のパスを撮影日を病日 1 にして適用して撮る。
// 撮影の最後に、パスタブの「適用の取り消し」でパスとパスから出たオーダーを消す。撮影の前には、
// 前回の撮影が途中で止まったときの残りを、この患者のオーダーとパスの記録ごと直接消す。
import { blur, labeled, openKarte, patientIdOf, removeOrdersOf } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const PATHWAY = "内視鏡的胃粘膜下層剥離術(ESD)(5泊6日)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const patientId = patientIdOf(page);
  const cleanUp = () =>
    removeOrdersOf(page, patientId, [
      ["Procedure", () => true],
      ["Observation", (o) => !o.category?.some((c) => c.coding?.some((coding) => coding.code === "vital-signs"))],
      ["Goal", () => true],
      ["CarePlan", () => true],
    ]);
  await cleanUp();
  await page.reload();
  const pane = page.locator(".karte-right");
  await pane.waitFor();

  // クリニカルパスを開く
  const paneButton = pane.getByRole("button", { name: "クリニカルパス", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // パスを選ぶ
  // 開発環境には検証用のパスもあるので、名前で絞ってから撮る。
  await pane.locator(".regimen-picker__search input").fill("ESD");
  const item = pane.locator(".regimen-picker__item").filter({ hasText: PATHWAY });
  await item.waitFor();
  await pane.locator(".regimen-picker__item").nth(1).waitFor({ state: "detached" });
  await blur(page);
  await mark(pane.locator(".regimen-picker__search"), { label: 1 });
  await mark(item, { label: 2 });
  await shot("02-picker", { target: pane.locator(".regimen-picker"), padding: 24 });
  await clearMarks();
  await item.click();

  // 入院・適応基準・対象病名・予定
  const form = pane.locator(".pathway-apply");
  await form.waitFor();
  await page.waitForLoadState("networkidle");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const admission = fieldset("入院");
  const criteria = fieldset("適応基準");
  const conditions = fieldset("対象病名");
  const plan = fieldset("予定");
  await labeled(admission, "入院日").locator("input").fill(SHOOTING_DATE);
  await criteria.locator("label").filter({ hasText: "適応基準を確認した" }).locator("input").check();
  await blur(page);
  await mark(labeled(admission, "適用先"), { label: 1 });
  await mark(labeled(admission, "入院日"), { label: 2, place: "corner" });
  await mark(criteria.locator("label").filter({ hasText: "適応基準を確認した" }), { label: 3 });
  await mark(conditions.locator("label").first(), { label: 4 });
  await mark(plan.locator("table"), { label: 5 });
  await shot("03-apply", { target: [admission, plan], padding: 40 });
  await clearMarks();

  // オーダー: 内視鏡(予約必須)の行を開き、日付未定にする(予約は適用の後に内視鏡室で取る)。
  const orders = fieldset("オーダー");
  const stack = orders.locator(".order-set-stack__item");
  const endoscopy = stack.filter({ has: page.locator(".order-set-stack__type", { hasText: "内視鏡" }) }).first();
  await endoscopy.getByRole("button", { name: "展開" }).click();
  await endoscopy.locator(".rad-order-frame__undated input").check();
  await blur(page);
  await endoscopy.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(endoscopy.locator(".order-set-stack__include"), { label: 1 });
  await mark(endoscopy.locator(".rad-order-frame__undated"), { label: 2, place: "corner" });
  await shot("05-endoscopy", { target: [endoscopy.locator(".order-set-stack__head"), endoscopy.locator(".rad-order-frame__head")], padding: 40 });
  await clearMarks();
  await endoscopy.getByRole("button", { name: "折りたたむ" }).click();
  await orders.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(orders.getByRole("button", { name: /すべて/ }), { label: 1, place: "corner" });
  await mark(stack.first().getByRole("button", { name: "展開" }), { label: 2 });
  await mark(stack.first().locator(".order-set-stack__include"), { label: 3, place: "corner" });
  await shot("04-orders", { target: [orders.locator(":scope > legend"), stack.nth(5)], padding: 40 });
  await clearMarks();

  const submit = form.getByRole("button", { name: /^適用/ });
  await submit.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await mark(form.getByRole("button", { name: "プレビュー" }), { label: 2, place: "corner" });
  await shot("06-submit", { target: [stack.last(), submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached", timeout: 120_000 });
  await page.waitForLoadState("networkidle");

  // パスタブ
  const group = page.locator(".karte-tabs__group").filter({ hasText: "診療情報" });
  await group.locator(".karte-tabs__tab").hover();
  await page.locator(".karte-tabs__menu").getByText("クリニカルパス", { exact: true }).click();
  const tab = page.locator(".karte-left .karte-tabpanel");
  await tab.locator(".pathway-sheet__modes").waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await mark(tab.locator(".pathway-sheet__modes"), { label: 1 });
  await mark(tab.getByRole("button", { name: "予定外を追加" }), { label: 2, place: "corner" });
  await mark(tab.getByRole("button", { name: "日程の変更" }), { label: 3, place: "corner" });
  await mark(tab.getByRole("button", { name: "終了・中止" }), { label: 4, place: "corner" });
  await mark(tab.getByRole("button", { name: "パスの操作" }), { label: 5, place: "corner" });
  await shot("07-sheet", { target: tab, padding: 24 });
  await clearMarks();

  // 適用の取り消し(撮影の後片付けを兼ねる)
  await tab.getByRole("button", { name: "パスの操作" }).click();
  await page.locator(".row-menu__item", { hasText: "適用の取り消し" }).click();
  const cancel = page.locator(".modal").filter({ hasText: "適用の取り消し" }).last();
  const cancelButton = cancel.getByRole("button", { name: "取消", exact: true });
  await cancelButton.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(cancelButton, { label: 1 });
  await shot("08-cancel", { target: cancel });
  await clearMarks();
  // 撮影の後片付けを兼ねて取り消す。
  await cancelButton.click();
  await cancel.waitFor({ state: "detached", timeout: 120_000 });
}
