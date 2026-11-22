// 操作マニュアル「オーダーセット」(docs/manual/order-set.md)
// 撮影の医師の「自分のセット」に、アムロジピンの処方 1 件のセット「高血圧 再診」を作り、外来の「見本 花子」に適用する。
// 撮影の前後に、このセットと、撮影日の処方をカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, openKarte, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const SET_NAME = "高血圧 再診";
const PRESCRIPTION_CARD = ".karte-card--prescription";
const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await page.goto("/order-sets");
  const owners = page.locator(".order-set-picker__tabs");
  const mine = owners.getByRole("tab", { name: "自分のセット" });
  await mine.click();
  await removeSet(page);

  // セットを作る
  const addSet = page.getByRole("button", { name: "+セット" }).first();
  await mark(mine, { label: 1, place: "corner" });
  await mark(addSet, { label: 2, place: "corner" });
  await shot("01-new", { target: [owners, addSet], padding: 24 });
  await clearMarks();
  await addSet.click();

  const editor = page.locator(".order-set-editor");
  await labeled(editor, "セット名").locator("input").fill(SET_NAME);
  await editor.getByRole("button", { name: "＋処方" }).click();
  const item = editor.locator(".order-set-stack__item").first();
  const rp = item.locator("fieldset.rp-card").first();
  await rp.getByRole("button", { name: "医薬品を選択" }).click();
  let modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill("アムロジピン錠5mg「あすか」");
  const medicineRow = modal.getByRole("row").filter({ hasText: "あすか" }).first();
  await medicineRow.waitFor();
  await pickRow(medicineRow);
  await modal.waitFor({ state: "detached" });
  await rp.locator(".rp-card__dose-input").first().fill("1");
  await rp.getByRole("button", { name: "用法を選択" }).click();
  modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).fill("1日1回朝食後");
  const usageRow = modal.getByRole("row").filter({ hasText: /朝食後\s+服用/ }).first();
  await usageRow.waitFor();
  await pickRow(usageRow);
  await modal.waitFor({ state: "detached" });
  await rp.locator(".rp-card__dose-count-input").fill("28");
  await blur(page);
  const save = editor.getByRole("button", { name: "保存", exact: true });
  await editor.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(labeled(editor, "セット名"), { label: 1, place: "corner" });
  await mark(labeled(editor, "置き場所"), { label: 2, place: "corner" });
  await mark(editor.locator(".dose-conversion__checkbox"), { label: 3, place: "corner" });
  await mark(item.locator(".order-set-stack__head"), { label: 4, place: "corner" });
  await mark(editor.locator(".order-set-editor__add"), { label: 5, place: "corner" });
  await mark(save, { label: 6, place: "corner" });
  await shot("02-editor", { target: editor, padding: 24, fullPage: false });
  await clearMarks();
  await save.click();
  await page.locator(".order-set-tree").getByText(SET_NAME, { exact: true }).waitFor();

  // カルテで適用する
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(PRESCRIPTION_CARD);
  await deleteAllCards(page, todaysCards);
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "セット", exact: true }).click();
  const pickerTabs = right.locator(".order-set-picker__tabs");
  const ownerTab = pickerTabs.getByRole("tab", { name: "医師 四郎" });
  await ownerTab.click();
  const setButton = right.getByText(SET_NAME, { exact: true });
  await setButton.waitFor();
  await mark(pickerTabs, { label: 1, place: "corner" });
  await mark(setButton, { label: 2 });
  await shot("03-pick", { target: [pickerTabs, setButton], padding: 32 });
  await clearMarks();
  await setButton.click();

  const applyDate = labeled(right, "適用日");
  await applyDate.waitFor();
  await page.waitForLoadState("networkidle");
  const submit = right.getByRole("button", { name: /^一括登録/ });
  await blur(page);
  await mark(applyDate, { label: 1, place: "corner" });
  await mark(right.getByRole("button", { name: "すべて開く" }), { label: 2, place: "corner" });
  await mark(right.locator(".order-set-stack__head").first(), { label: 3, place: "corner" });
  await mark(submit, { label: 4 });
  await shot("04-apply", { target: [applyDate, submit, right.locator(".order-set-stack__head").first()], padding: 32 });
  await clearMarks();
  await submit.click();
  await todaysCards.first().waitFor();
  await page.waitForLoadState("networkidle");
  await shot("05-card", { target: todaysCards.first() });

  await deleteAllCards(page, todaysCards);
  await page.goto("/order-sets");
  await mine.click();
  await removeSet(page);
}

/** 自分のセットから、撮影で作ったセットを消す(削除の確認はブラウザの確認画面なので、承諾して進める)。 */
async function removeSet(page) {
  const tree = page.locator(".order-set-picker__tabs").locator("..");
  await page.waitForLoadState("networkidle");
  const node = tree.locator("li").filter({ hasText: SET_NAME }).first();
  if (!(await node.count())) return;
  const accept = (dialog) => dialog.accept();
  page.on("dialog", accept);
  try {
    await node.getByRole("button", { name: "削除" }).first().click();
    await node.waitFor({ state: "detached" });
  } finally {
    page.off("dialog", accept);
  }
}
