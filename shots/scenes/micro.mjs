// 操作マニュアル「細菌検査」(docs/manual/micro.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、喀出痰の塗抹・培養・感受性を登録し、採取を記録して撮る。
// 撮影の前後に、撮影日のカードをカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const ITEMS = ["塗抹・鏡検", "培養・同定", "薬剤感受性"];
const TARGET = "Streptococcus pneumoniae";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(".karte-card");
  await deleteAllCards(page, todaysCards);

  // 細菌検査登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "細菌検査", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 検査共通
  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "至急区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "検査日"), { label: 4, place: "corner" });
  await mark(common.getByRole("button", { name: "＋依頼コメント" }), { label: 5 });
  await shot("02-common", { target: common, padding: 40 });
  await clearMarks();

  // 検体
  const specimen = fieldset("検体");
  await labeled(specimen, "検体種別").locator("select").selectOption({ label: "喀出痰" });
  await labeled(specimen, "採取部位").locator("select").selectOption({ label: "気管内" });
  await labeled(specimen, "採取方法").locator("select").selectOption({ label: "自然喀出" });
  await blur(page);
  await mark(labeled(specimen, "検体種別"), { label: 1 });
  await mark(labeled(specimen, "採取部位"), { label: 2, place: "corner" });
  await mark(labeled(specimen, "左右"), { label: 3, place: "corner" });
  await mark(labeled(specimen, "採取方法"), { label: 4 });
  await mark(labeled(specimen, "採取予定日時"), { label: 5, place: "corner" });
  await shot("03-specimen", { target: specimen, padding: 40 });
  await clearMarks();

  // 検査項目と目的菌
  const items = fieldset("検査項目");
  const targets = fieldset("目的菌");
  for (const name of ITEMS) await items.getByRole("checkbox", { name, exact: true }).check();
  await targets.getByRole("checkbox", { name: TARGET, exact: true }).check();
  await blur(page);
  await items.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(items, { label: 1 });
  await mark(targets.locator("label").filter({ hasText: new RegExp(`^${TARGET}$`) }), { label: 2, place: "corner" });
  await shot("04-items", { target: [items, targets.locator("label").filter({ hasText: "Staphylococcus aureus (MRSA)" })], padding: 40 });
  await clearMarks();

  // 目的菌の検索と臨床情報
  const clinical = fieldset("臨床情報");
  const otherSearch = targets.getByPlaceholder(/その他の菌を検索/);
  await clinical.getByPlaceholder("病名を直接入力").fill("肺炎");
  await blur(page);
  // 枠の中だけがスクロールするので、注釈を付ける前に全体が見える位置へ送っておく。
  await clinical.evaluate((el) => el.scrollIntoView({ block: "end" }));
  await mark(otherSearch, { label: 1 });
  await mark(clinical.locator("select").first(), { label: 2 });
  await mark(clinical.locator("textarea"), { label: 3 });
  await mark(clinical.getByRole("button", { name: "処方取込" }), { label: 4, place: "corner" });
  await mark(clinical.locator("select").last(), { label: 5 });
  await shot("05-clinical", { target: [otherSearch, clinical], padding: 40 });
  await clearMarks();

  // 登録
  const selected = form.locator(".order-select__preview");
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(selected, { label: 1 });
  await mark(submit, { label: 2 });
  await shot("06-submit", { target: [selected, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  const card = todaysCards.filter({ hasText: "細菌検査" }).first();
  await card.waitFor();
  await shot("07-card", { target: card });

  // 採取を記録する
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "採取").click();
  const modal = page.locator(".modal").filter({ hasText: "細菌検査の採取" });
  await modal.waitFor();
  const issueLabel = modal.locator("label").filter({ hasText: "ラベル発行" });
  await blur(page);
  await mark(labeled(modal, "採取日時"), { label: 1, place: "corner" });
  await mark(labeled(modal, "採取部位"), { label: 2, place: "corner" });
  await mark(labeled(modal, "採取方法"), { label: 3, place: "corner" });
  await mark(issueLabel, { label: 4, place: "corner" });
  await mark(modal.getByRole("button", { name: "採取", exact: true }), { label: 5 });
  await shot("08-collect", { target: modal });
  await clearMarks();
  // 撮影ではラベルの PDF を開かない。
  await issueLabel.locator("input").uncheck();
  await modal.getByRole("button", { name: "採取", exact: true }).click();
  await modal.waitFor({ state: "detached" });
  await card.filter({ hasText: "採取" }).getByText(/採取.*09:00|09:00/).first().waitFor().catch(() => {});
  await page.waitForLoadState("networkidle");

  // 登録した細菌検査の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "検査結果表示"), { label: 2 });
  await mark(menuItem(page, "採取修正").or(menuItem(page, "採取")).first(), { label: 3 });
  await mark(menuItem(page, "ラベル発行"), { label: 4 });
  await mark(menuItem(page, "編集"), { label: 5 });
  await mark(menuItem(page, "削除"), { label: 6 });
  await shot("09-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, todaysCards);
}
