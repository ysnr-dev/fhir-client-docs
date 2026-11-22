// 操作マニュアル「診療記録」(docs/manual/clinical-note.md)
// 外来の「見本 花子」(高血圧症で通院中)の再診を SOAP で書き、客観的情報(O)にシェーマを描き込んで登録する。
// 撮影の前後に、撮影日の診療記録をカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const NOTE_CARD = ".karte-card--note";
const SCHEMA = "人体全身図";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(NOTE_CARD);
  await deleteAllCards(page, todaysCards);

  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "診療記録", exact: true }).click();
  const form = right.locator("form").first();

  // 記録情報
  const info = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "記録情報" }) });
  await info.waitFor();
  await labeled(info, "対象プロブレム").locator("select").selectOption({ label: "#1 高血圧症" });
  await blur(page);
  await mark(info.locator(".clinical-note-form__mode"), { label: 1, place: "corner" });
  await mark(labeled(info, "タイトル"), { label: 2, place: "corner" });
  await mark(labeled(info, "対象プロブレム"), { label: 3, place: "corner" });
  await mark(labeled(info, "記録日時"), { label: 4, place: "corner" });
  await mark(labeled(info, "ステータス"), { label: 5, place: "corner" });
  await shot("01-info", { target: info, padding: 32 });
  await clearMarks();

  // 本文を書く
  const editors = form.locator(".ProseMirror");
  await editors.first().waitFor();
  await editors.nth(0).click();
  await page.keyboard.type("朝の家庭血圧は 130 台で安定。2 週間ほど前から夕方に足のむくみが気になる。");
  await editors.nth(1).click();
  await page.keyboard.type("血圧 132/82mmHg、脈拍 70/分。両下腿に軽度の圧痕性浮腫。");
  await editors.nth(2).click();
  await page.keyboard.type("血圧のコントロールは良好。浮腫はアムロジピンによるものを疑う。");
  await editors.nth(3).click();
  await page.keyboard.type("処方は継続。浮腫が続けば降圧薬の変更を検討。4 週後に再診。");
  await blur(page);

  const firstSection = sectionOf(form, 0);
  await mark(firstSection.getByRole("combobox", { name: "セクション種別" }), { label: 1, place: "corner" });
  await mark(editors.nth(0), { label: 2 });
  await mark(firstSection.getByTitle("文字装飾パネルの表示切替"), { label: 3, place: "corner" });
  await mark(firstSection.getByTitle("画像を挿入"), { label: 4, place: "corner" });
  await mark(firstSection.getByRole("button", { name: "テンプレート" }), { label: 5, place: "corner" });
  await mark(firstSection.getByRole("button", { name: "シェーマ" }), { label: 6, place: "corner" });
  await mark(firstSection.locator(".clinical-note-section__actions"), { label: 7, place: "corner" });
  await shot("02-section", { target: firstSection, padding: 32 });
  await clearMarks();

  // シェーマを選ぶ
  const objective = sectionOf(form, 1);
  await editors.nth(1).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await objective.getByRole("button", { name: "シェーマ" }).click();
  let modal = page.locator(".modal").filter({ hasText: "シェーマを選択" });
  await modal.getByPlaceholder("名称で検索").fill("人体");
  const schemaCard = modal.getByRole("button", { name: SCHEMA });
  await schemaCard.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(modal.getByPlaceholder("名称で検索"), { label: 1 });
  await mark(schemaCard, { label: 2 });
  // 分類の木には開発の検証用の分類があるので、検索欄と一覧だけを撮る。
  await shot("03-schema", { target: [modal.getByPlaceholder("名称で検索"), schemaCard], padding: 40 });
  await clearMarks();
  await schemaCard.click();

  // 描き込む
  modal = page.locator(".modal").filter({ hasText: `シェーマ: ${SCHEMA}` });
  const canvas = modal.locator(".schema-paint__canvas canvas").last();
  await canvas.waitFor();
  await page.waitForTimeout(500);
  await modal.getByRole("button", { name: "楕円", exact: true }).click();
  await modal.getByRole("button", { name: "赤", exact: true }).click();
  const box = await canvas.boundingBox();
  for (const x of [0.427, 0.577]) {
    await page.mouse.move(box.x + box.width * (x - 0.05), box.y + box.height * 0.72);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (x + 0.05), box.y + box.height * 0.88, { steps: 5 });
    await page.mouse.up();
  }
  await modal.getByRole("button", { name: "選択", exact: true }).click();
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.1);
  const toolbar = modal.locator(".schema-annotator__toolbar");
  await mark(toolbar.getByRole("group", { name: "ツール" }), { label: 1, place: "corner" });
  await mark(toolbar.getByRole("group", { name: "色" }), { label: 2, place: "corner" });
  await mark(toolbar.getByRole("group", { name: "太さ" }), { label: 3, place: "corner" });
  await mark(toolbar.getByRole("button", { name: "元に戻す" }).locator(".."), { label: 4, place: "corner" });
  await mark(modal.getByRole("button", { name: "記録に挿入" }), { label: 5, place: "corner" });
  await shot("04-paint", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "記録に挿入" }).click();
  await modal.waitFor({ state: "detached" });

  // 登録する
  const submit = form.getByRole("button", { name: "登録", exact: true });
  await objective.locator("img").first().waitFor();
  await blur(page);
  await objective.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(objective.locator("img").first(), { label: 1 });
  await mark(submit, { label: 2 });
  await shot("05-submit", { target: [objective, submit], padding: 32 });
  await clearMarks();
  await submit.click();
  const card = todaysCards.first();
  await card.waitFor();
  await card.locator("img").first().waitFor();
  await page.waitForLoadState("networkidle");
  await card.getByRole("button", { name: "続き表示" }).click();
  await shot("06-card", { target: card });

  // 登録した記録の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(menuItem(page, "詳細表示"), { label: 1 });
  await mark(menuItem(page, "変更履歴"), { label: 2 });
  await mark(menuItem(page, "編集"), { label: 3 });
  await mark(menuItem(page, "削除"), { label: 4 });
  await shot("07-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}

/** 本文の n 番目のセクション(種別の選択・道具のボタン・本文の入力欄の組)。 */
function sectionOf(form, n) {
  return form.locator(".clinical-note-section").nth(n);
}
