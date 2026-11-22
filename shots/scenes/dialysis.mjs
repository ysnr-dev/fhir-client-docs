// 操作マニュアル「透析」(docs/manual/dialysis.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、翌日からの血液透析(火・木・土の午前)を登録して撮る。
// 開発環境の血液浄化器のマスタは検証用の名前なので、血液浄化器は選ばずに撮る。
// 撮影の前後に、この患者の透析のカードをカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const DIALYSATE = "カーボスター透析剤・Ｌ ９Ｌ";
const ANTICOAGULANT = "ヘパリン";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const dialysisCards = page.locator(".karte-card").filter({ hasText: "透析" });
  await deleteAllCards(page, dialysisCards);

  // 透析登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "透析", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const content = fieldset("透析内容");
  await content.waitFor();
  await page.waitForLoadState("networkidle");

  // 浄化方法・期間・曜日 × シフト
  const period = fieldset("期間");
  const shifts = fieldset("曜日 × シフト");
  await labeled(content, "浄化方法").locator("select").selectOption({ label: "血液透析(HD)" });
  await labeled(period, "開始日").locator("input").fill(addDays(SHOOTING_DATE, 1));
  const morning = shifts.getByRole("row").filter({ hasText: "午前" });
  for (const day of [2, 4, 6]) await morning.locator("input[type=checkbox]").nth(day - 1).check();
  await blur(page);
  await mark(labeled(content, "浄化方法"), { label: 1 });
  await mark(content.locator("label").filter({ hasText: "ベッドサイドで実施" }), { label: 2, place: "corner" });
  await mark(labeled(period, "開始日"), { label: 3 });
  await mark(labeled(period, "終了日"), { label: 4, place: "corner" });
  await mark(shifts.locator("table"), { label: 5 });
  await shot("02-schedule", { target: [content, shifts], padding: 40 });
  await clearMarks();

  // 透析条件
  const conditions = fieldset("透析条件");
  await labeled(conditions, "透析時間").locator("input").fill("240");
  await labeled(conditions, "QB").locator("input").fill("200");
  await labeled(conditions, "QD").locator("input").fill("500");
  await blur(page);
  await conditions.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(conditions, "透析時間"), { label: 1 });
  await mark(labeled(conditions, "QB"), { label: 2, place: "corner" });
  await mark(labeled(conditions, "QD"), { label: 3, place: "corner" });
  await mark(conditions.getByRole("button", { name: "選択" }).first(), { label: 4, place: "corner" });
  await mark(conditions.getByRole("button", { name: "追加" }), { label: 5 });
  await shot("03-conditions", { target: conditions, padding: 40 });
  await clearMarks();

  // 透析液と抗凝固薬を選ぶ
  const fluids = fieldset("使用液");
  await fluids.getByRole("button", { name: "選択" }).first().click();
  let modal = page.locator(".modal").filter({ hasText: "透析液を選択" });
  await modal.getByRole("textbox").first().fill(DIALYSATE);
  let row = modal.getByRole("row").filter({ hasText: "カーボスター透析剤・Ｌ　９Ｌ" }).first();
  await row.waitFor();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });

  const anticoagulant = fieldset("抗凝固薬");
  await anticoagulant.getByRole("button", { name: "選択" }).click();
  modal = page.locator(".modal").filter({ hasText: "抗凝固薬を選択" });
  await modal.getByRole("textbox").first().fill(ANTICOAGULANT);
  row = modal.getByRole("row").filter({ hasText: "ヘパリン" }).first();
  await row.waitFor();
  await blur(page);
  await mark(modal.getByRole("textbox").first(), { label: 1 });
  await mark(row, { label: 2 });
  await shot("04-drug-search", { target: modal });
  await clearMarks();
  await pickRow(row);
  await modal.waitFor({ state: "detached" });
  await labeled(anticoagulant, "初回量").locator("input").fill("1000");
  await labeled(anticoagulant, "持続量").locator("input").fill("500");

  // バスキュラーアクセスと依頼共通
  const access = fieldset("バスキュラーアクセス");
  const common = fieldset("依頼共通");
  await labeled(access, "種類").locator("select").selectOption({ label: "カテーテル" });
  await labeled(access, "部位").locator("input").fill("右内頸静脈");
  await blur(page);
  await fluids.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(fluids, { label: 1 });
  await mark(labeled(anticoagulant, "薬剤"), { label: 2 });
  await mark(labeled(anticoagulant, "初回量"), { label: 3, place: "corner" });
  await mark(labeled(anticoagulant, "持続量"), { label: 4, place: "corner" });
  await mark(labeled(anticoagulant, "単位"), { label: 5, place: "corner" });
  await mark(access, { label: 6 });
  await shot("05-fluids-access", { target: [fluids, access], padding: 40 });
  await clearMarks();

  // 登録
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(common.getByRole("button", { name: "＋透析部門への指示" }), { label: 3 });
  await mark(submit, { label: 4 });
  await shot("06-submit", { target: [common, submit], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = dialysisCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");

  // 登録した透析の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("07-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, dialysisCards);
}
