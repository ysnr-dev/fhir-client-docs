// 操作マニュアル「病理検査」(docs/manual/patho.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、胃前庭部の生検の組織診を登録し、採取を記録して撮る。
// 撮影の前後に、撮影日のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const CLINICAL = "上部消化管内視鏡で胃前庭部前壁に 0-IIc 様の陥凹性病変。同部より生検 2 個。";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(".karte-card");
  await deleteAllCards(page, todaysCards);

  // 病理検査登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "病理検査", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 検査共通
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = fieldset("検査共通");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "採取(予定)日時").locator("input").fill(`${SHOOTING_DATE}T10:00`);
  await blur(page);
  await mark(labeled(common, "検査区分"), { label: 1 });
  await mark(labeled(common, "対象プロブレム"), { label: 2, place: "corner" });
  await mark(labeled(common, "入外区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "至急区分"), { label: 4, place: "corner" });
  await mark(labeled(common, "採取(予定)日時"), { label: 5 });
  await mark(labeled(common, "報告希望日"), { label: 6, place: "corner" });
  await mark(common.getByRole("button", { name: "＋依頼コメント" }), { label: 7 });
  await shot("02-common", { target: common, padding: 40 });
  await clearMarks();

  // 臓器・検査材料の検索
  const specimen = form.locator(".patho-order__specimen").first();
  await specimen.getByRole("button", { name: "検索", exact: true }).click();
  const organModal = page.locator(".modal").filter({ hasText: "臓器・検査材料を検索" });
  await organModal.locator("input").first().fill("胃");
  await organModal.getByRole("button", { name: "検索", exact: true }).click();
  const organRow = organModal.getByRole("row").filter({ hasText: "胃前庭部" }).first();
  await organRow.waitFor();
  await blur(page);
  await mark(labeled(organModal, "臓器名・ICD-10"), { label: 1 });
  await mark(organModal.getByRole("button", { name: "検索", exact: true }), { label: 2 });
  await mark(organRow, { label: 3 });
  await shot("03-organ-search", { target: organModal });
  await clearMarks();
  await page.keyboard.press("Escape");
  await organModal.waitFor({ state: "detached" });

  // 検体
  await specimen.locator(".patho-order__frequent").getByRole("button", { name: "胃前庭部" }).click();
  await labeled(specimen, "採取法").locator("select").selectOption({ label: "生検" });
  await labeled(specimen, "検体個数").locator("input").fill("2");
  await labeled(specimen, "補足").locator("input").fill("前壁 陥凹性病変");
  await blur(page);
  const specimens = fieldset("検体");
  await specimens.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(specimen.locator(".patho-order__organ-group"), { label: 1 });
  await mark(labeled(specimen, "検体タイプ"), { label: 2, place: "corner" });
  await mark(labeled(specimen, "左右"), { label: 3, place: "corner" });
  await mark(labeled(specimen, "採取法"), { label: 4 });
  await mark(labeled(specimen, "検体個数"), { label: 5, place: "corner" });
  await mark(labeled(specimen, "容器数"), { label: 6, place: "corner" });
  await mark(labeled(specimen, "補足"), { label: 7, place: "corner" });
  await mark(specimens.getByRole("button", { name: "＋検体追加" }), { label: 8 });
  await shot("04-specimen", { target: specimens, padding: 40 });
  await clearMarks();

  // 臨床情報とシェーマ
  const clinical = fieldset("臨床情報");
  const schema = fieldset("シェーマ");
  await clinical.locator("textarea").fill(CLINICAL);
  await blur(page);
  await schema.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(clinical.locator("textarea"), { label: 1 });
  await mark(clinical.getByRole("button", { name: "テンプレート" }), { label: 2, place: "corner" });
  await mark(schema.getByRole("button", { name: "＋シェーマ追加" }), { label: 3 });
  await shot("05-clinical", { target: [clinical, schema], padding: 40 });
  await clearMarks();

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("06-submit", { target: [schema, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = todaysCards.filter({ hasText: "病理検査" }).first();
  await card.waitFor();
  await shot("07-card", { target: card });

  // 採取を記録する
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "採取").click();
  const modal = page.locator(".modal").filter({ hasText: "病理検査の採取" });
  await modal.waitFor();
  const issueLabel = modal.locator("label").filter({ hasText: "ラベル発行" });
  await blur(page);
  await mark(labeled(modal, "採取日時"), { label: 1, place: "corner" });
  await mark(issueLabel, { label: 2, place: "corner" });
  await mark(modal.locator("table, .patho-collection__specimens").first(), { label: 3 });
  await mark(modal.getByRole("button", { name: /^採取/ }).last(), { label: 4 });
  await shot("08-collect", { target: modal });
  await clearMarks();
  // 撮影ではラベルの PDF を開かない。
  await issueLabel.locator("input").uncheck();
  await modal.getByRole("button", { name: /^採取/ }).last().click();
  await modal.waitFor({ state: "detached" });
  await card.getByText(/採取:/).waitFor();

  // 登録した病理検査の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "採取修正"), { label: 2 });
  await mark(menuItem(page, "ラベル発行"), { label: 3 });
  await mark(menuItem(page, "編集"), { label: 4 });
  await mark(menuItem(page, "削除"), { label: 5 });
  await shot("09-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
