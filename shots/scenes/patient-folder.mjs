// 操作マニュアル「患者フォルダ」(docs/manual/patient-folder.md)
// 医師 四郎が自分のフォルダに「受け持ち」と、その下に「外来」「入院」を作る。「外来」には患者フォルダの画面の
// 「患者追加」で見本 花子・見本 次郎を、「入院」には患者検索の行の「フォルダ」で見本 太郎を入れ、
// 「受け持ち」を下位フォルダごと開いて撮る。撮影の前後に「受け持ち」を下位フォルダ・中の患者ごと消す。
import { blur, labeled, menuItem, settle } from "../lib/karte.mjs";
import { removeOwnFolders } from "../lib/data.mjs";

const ROOT = "受け持ち";
const OUTPATIENT = "外来";
const INPATIENT = "入院";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const cleanUp = () => removeOwnFolders(page, [ROOT]);
  await cleanUp();

  await page.goto("/patient-folders");
  const tabs = page.getByRole("tablist", { name: "フォルダの持ち主" });
  await tabs.getByRole("tab", { name: "自分のフォルダ" }).click();
  await page.locator(".order-set__empty, .order-set-tree").first().waitFor();
  await page.waitForLoadState("networkidle");
  if (await page.locator(".order-set-tree").count()) throw new Error("医師 四郎の自分のフォルダに撮影用でないフォルダがあります");

  // フォルダを作る
  await page.getByRole("button", { name: "+フォルダ", exact: true }).first().click();
  const folderModal = page.locator(".modal").filter({ hasText: "フォルダ追加" });
  await labeled(folderModal, "フォルダ名").locator("input").fill(ROOT);
  await blur(page);
  await settle(folderModal);
  await mark(tabs, { label: 1, place: "corner" });
  await mark(page.locator(".order-set__root-actions").getByRole("button", { name: "+フォルダ" }), { label: 2, place: "corner" });
  await mark(labeled(folderModal, "フォルダ名"), { label: 3 });
  await mark(labeled(folderModal, "親フォルダ"), { label: 4 });
  await mark(folderModal.getByRole("button", { name: "保存" }), { label: 5 });
  await shot("01-new-folder", { target: [page.locator(".page__header"), page.locator(".order-set__tree"), folderModal], padding: 24 });
  await clearMarks();
  await folderModal.getByRole("button", { name: "保存" }).click();
  await folderModal.waitFor({ state: "detached" });
  for (const name of [OUTPATIENT, INPATIENT]) await addSubfolder(page, ROOT, name);

  // 患者追加
  await folderRow(page, OUTPATIENT).locator(".order-set-tree__name").click();
  await page.getByRole("button", { name: "患者追加" }).click();
  const addModal = page.locator(".modal").filter({ hasText: `患者追加(${OUTPATIENT})` });
  await labeled(addModal, "メモ").locator("input").fill("高血圧症");
  await searchAndPick(page, addModal, "見本 花子");
  await addModal.getByText("見本 花子 を追加しました。").waitFor();
  await blur(page);
  await mark(labeled(addModal, "メモ"), { label: 1 });
  await mark(labeled(addModal, "氏名"), { label: 2 });
  await mark(addModal.locator(".master-search__row").first(), { label: 3 });
  await mark(addModal.locator(".patient-folder__message"), { label: 4 });
  await shot("02-add-patient", { target: addModal, padding: 24 });
  await clearMarks();
  await labeled(addModal, "メモ").locator("input").fill("結腸癌の化学療法");
  await searchAndPick(page, addModal, "見本 次郎");
  await addModal.getByText("見本 次郎 を追加しました。").waitFor();
  await page.keyboard.press("Escape");
  await addModal.waitFor({ state: "detached" });

  // 患者検索の行の「フォルダ」から入れる
  await page.goto("/patients");
  await page.getByLabel("氏名(漢字・カナ部分一致)").fill("見本 太郎");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  const patientRow = page.getByRole("row").filter({ hasText: "見本 太郎" });
  await patientRow.first().waitFor();
  if ((await patientRow.count()) !== 1) throw new Error("患者「見本 太郎」が 1 人に絞れません");
  await patientRow.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "フォルダ").click();
  const assign = page.locator(".modal").filter({ hasText: "患者フォルダ(" });
  await assign.getByRole("tablist", { name: "フォルダの持ち主" }).getByRole("tab", { name: "自分のフォルダ" }).click();
  const inpatientCheck = assign.locator("label").filter({ hasText: new RegExp(`^${INPATIENT}$`) }).locator("input");
  await inpatientCheck.click();
  await page.waitForFunction((el) => el.checked, await inpatientCheck.elementHandle());
  await page.waitForLoadState("networkidle");
  await assign.getByRole("tab", { name: /自分のフォルダ\s*1/ }).waitFor();
  await settle(assign);
  await mark(assign.getByRole("tablist", { name: "フォルダの持ち主" }), { label: 1 });
  await mark(assign.locator("label").filter({ hasText: new RegExp(`^${INPATIENT}$`) }), { label: 2 });
  await shot("03-assign", { target: assign, padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  // フォルダの患者を見る
  await page.goto("/patient-folders?scope=practitioner");
  await folderRow(page, ROOT).locator(".order-set-tree__name").first().click();
  const subToggle = page.locator(".patient-folder__sub-toggle input");
  await subToggle.click();
  await page.waitForFunction((el) => el.checked, await subToggle.elementHandle());
  const members = page.locator(".patient-folder__members tbody tr");
  await members.filter({ hasText: "見本 太郎" }).waitFor();
  await page.waitForLoadState("networkidle");
  const hanako = members.filter({ hasText: "見本 花子" });
  await hanako.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "移動").waitFor();
  const root = folderRow(page, ROOT).first();
  await mark(root.locator(".order-set-tree__name").first(), { label: 1, place: "corner" });
  await mark(root.locator(".schema-master__cat-actions").first(), { label: 2, place: "corner" });
  await mark(page.locator(".patient-folder__sub-toggle"), { label: 3, place: "corner" });
  await mark(page.getByRole("button", { name: "患者追加" }), { label: 4, place: "corner" });
  await mark(hanako.locator(".patient-folder__note"), { label: 5, place: "corner" });
  await mark(page.locator(".row-menu__items").last(), { label: 6 });
  await shot("04-members", { target: [page.locator(".page__header"), page.locator(".order-set__tree"), page.locator(".patient-folder__members"), page.locator(".row-menu__items").last()], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cleanUp();
}

/** フォルダの木の、名前が name の行(子フォルダの行を含む li)。 */
function folderRow(page, name) {
  return page.locator(".order-set-tree li").filter({
    has: page.locator(":scope > .order-set-tree__row .order-set-tree__name", { hasText: new RegExp(`^${name}\\s*\\d*$`) }),
  });
}

/** 親フォルダの行の「+フォルダ」で、その中にフォルダを作る。 */
async function addSubfolder(page, parent, name) {
  await folderRow(page, parent).first().locator(":scope > .order-set-tree__row").getByTitle("このフォルダの中にフォルダを追加").click();
  const modal = page.locator(".modal").filter({ hasText: "フォルダ追加" });
  await labeled(modal, "フォルダ名").locator("input").fill(name);
  await modal.getByRole("button", { name: "保存" }).click();
  await modal.waitFor({ state: "detached" });
  await folderRow(page, name).first().waitFor();
}

/** 患者追加のモーダルで、氏名で検索して 1 人を選ぶ。 */
async function searchAndPick(page, modal, name) {
  await labeled(modal, "氏名").locator("input").fill(name);
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const rows = modal.locator(".master-search__row");
  await rows.filter({ hasText: name }).first().waitFor();
  if ((await rows.count()) !== 1) throw new Error(`患者「${name}」が 1 人に絞れません`);
  await rows.first().click();
}
