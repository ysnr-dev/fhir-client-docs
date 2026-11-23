// 操作マニュアル「処方」(docs/manual/prescription.md)
// 患者「見本 花子」(撮影用の架空の患者。薬剤アレルギーにロキソプロフェンを登録してある)で撮る。
// 撮影の前後に、この患者の撮影日の処方をカルテから削除して、毎回同じ画面から始める。
import { blur, dayGroup, deleteAllCards, labeled, menuItem, openKarte, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const PRESCRIPTION_CARD = ".karte-card--prescription";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  // 撮影日の処方だけを消す(撮影用データの受診歴の処方は残す)。
  const todaysCards = dayGroup(page, SHOOTING_DATE).locator(PRESCRIPTION_CARD);
  await deleteAllCards(page, todaysCards);

  // 処方登録を開く
  const paneButton = page.locator(".karte-right").getByRole("button", { name: "処方", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 処方共通
  const form = page.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "処方区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "投与開始日"), { label: 4 });
  await mark(common.getByRole("button", { name: "＋処方箋コメント" }), { label: 5 });
  await shot("02-common", { target: common, padding: 40 });
  await clearMarks();

  // 医薬品を選ぶ
  const rp = form.locator("fieldset.rp-card").first();
  await rp.getByRole("button", { name: "医薬品を選択" }).click();
  let modal = page.locator(".modal");
  await modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)").first().fill("アムロジピン錠5mg「あすか」");
  const medicineRow = modal.getByRole("row").filter({ hasText: "あすか" }).first();
  await medicineRow.waitFor();
  await blur(page);
  await mark(modal.locator(".master-search__mode"), { label: 1 });
  await mark(modal.getByRole("textbox").first(), { label: 2 });
  await mark(medicineRow, { label: 3 });
  await shot("03-medicine", { target: modal });
  await clearMarks();
  await pickRow(medicineRow);
  await modal.waitFor({ state: "detached" });

  // 用量
  const doseInput = rp.locator(".rp-card__dose-input").first();
  await doseInput.fill("1");
  await blur(page);
  await mark(rp.getByLabel("用量の入力"), { label: 1, place: "corner" });
  await mark(doseInput, { label: 2, place: "corner" });
  await mark(rp.locator(".rp-card__medicine-unit select").first(), { label: 3, place: "corner" });
  await mark(rp.getByRole("button", { name: "用法を選択" }), { label: 4 });
  await shot("04-dose", { target: rp });
  await clearMarks();

  // 用法を選ぶ
  await rp.getByRole("button", { name: "用法を選択" }).click();
  modal = page.locator(".modal");
  await modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)").fill("1日1回朝食後");
  const usageRow = modal.getByRole("row").filter({ hasText: /朝食後\s+服用/ }).first();
  await usageRow.waitFor();
  await blur(page);
  await mark(modal.getByRole("textbox").first(), { label: 1 });
  await mark(usageRow, { label: 2 });
  await shot("05-usage", { target: modal });
  await clearMarks();
  await pickRow(usageRow);
  await modal.waitFor({ state: "detached" });

  // 投与日数
  const days = rp.locator(".rp-card__dose-count-input");
  await days.fill("14");
  await blur(page);
  await mark(days, { label: 1 });
  await shot("06-days", { target: rp });
  await clearMarks();

  // 医薬品・RP の追加と補足の入力
  const addRp = form.locator(".prescription-form__actions");
  const submitArea = form.locator(".prescription-form__submit");
  await rp.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(rp.getByRole("button", { name: "この医薬品の操作" }), { label: 1 });
  await mark(rp.getByRole("button", { name: "+ 医薬品追加" }), { label: 2 });
  await mark(rp.getByRole("button", { name: "用法の操作" }), { label: 3, place: "corner" });
  await mark(addRp.getByRole("button", { name: "+ RP追加" }), { label: 4 });
  await shot("07-more", { target: [rp, addRp], padding: 40 });
  await clearMarks();

  // 登録
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await mark(submit, { label: 1 });
  await shot("08-submit", { target: [rp, addRp, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  const card = todaysCards.first();
  await card.waitFor();
  await shot("09-card", { target: card });

  // 登録した処方の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(page.getByRole("menuitem", { name: "編集" }).or(menuItem(page, "編集")), { label: 2 });
  await mark(page.getByRole("menuitem", { name: "削除" }).or(menuItem(page, "削除")), { label: 3 });
  await shot("10-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  // 警告と確認
  await paneButton.click();
  await form.waitFor();
  const warnRp = form.locator("fieldset.rp-card").first();
  await warnRp.getByRole("button", { name: "医薬品を選択" }).click();
  modal = page.locator(".modal");
  await modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)").first().fill("ロキソニン錠60mg");
  const loxoninRow = modal.getByRole("row").filter({ hasText: "ロキソニン" }).first();
  await loxoninRow.waitFor();
  await pickRow(loxoninRow);
  await modal.waitFor({ state: "detached" });
  await warnRp.locator(".rp-card__dose-input").first().fill("3");
  await warnRp.getByRole("button", { name: "用法を選択" }).click();
  modal = page.locator(".modal");
  await modal.getByPlaceholder("部分一致で検索(かな・全半角の違いは無視)").fill("1日3回朝昼夕食後");
  const tidRow = modal.getByRole("row").filter({ hasText: /朝昼夕食後\s+服用/ }).first();
  await tidRow.waitFor();
  await pickRow(tidRow);
  await modal.waitFor({ state: "detached" });
  await warnRp.locator(".rp-card__dose-count-input").fill("5");
  await blur(page);
  const warning = warnRp.locator(".medicine-warning").filter({ hasText: "アレルギー" }).first();
  await warning.waitFor();
  await mark(warning, { label: 1 });
  await shot("11-warning", { target: warnRp });
  await clearMarks();

  await form.getByRole("button", { name: "登録", exact: true }).click();
  modal = page.locator(".modal").filter({ hasText: "警告の確認" });
  await modal.waitFor();
  await modal.locator("select").first().selectOption({ index: 1 });
  await blur(page);
  await mark(modal.locator("select").first(), { label: 1 });
  await mark(modal.getByPlaceholder("補足"), { label: 2, place: "corner" });
  await mark(modal.getByRole("button", { name: "登録", exact: true }), { label: 3 });
  await mark(modal.getByRole("button", { name: "戻る" }), { label: 4, place: "corner" });
  await shot("12-confirm", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "戻る" }).click();
  await page.locator(".karte-right").getByRole("button", { name: "閉じる" }).click();
  await form.waitFor({ state: "detached" });

  // 削除
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "削除").click();
  modal = page.locator(".modal").filter({ hasText: "処方の削除" });
  await modal.waitFor();
  await modal.getByRole("combobox").fill("誤入力");
  await blur(page);
  await mark(modal.getByRole("combobox"), { label: 1 });
  await mark(modal.getByRole("button", { name: "削除", exact: true }), { label: 2 });
  await shot("13-delete", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "削除", exact: true }).click();
  await card.waitFor({ state: "detached" });
}
