// 操作マニュアル「注射オーダー」(docs/manual/injection.md)
// 患者「見本 花子」(撮影用の架空の患者)で、今日から 3 日間の連日の点滴を登録して撮る。
// 撮影の前後に、この患者の注射をカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const INJECTION_CARD = ".karte-card--injection";
const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  await deleteAllCards(page, INJECTION_CARD);

  // 注射登録を開く
  const paneButton = page.locator(".karte-right").getByRole("button", { name: "注射", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  // 注射共通
  const form = page.locator(".prescription-form");
  const common = form.locator("fieldset").first();
  await common.waitFor();
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "注射区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "注射日"), { label: 4, place: "corner" });
  await mark(common.getByRole("button", { name: "＋注射コメント" }), { label: 5 });
  await shot("02-common", { target: common, padding: 40 });
  await clearMarks();

  // 連日の注射: 今日から 3 日間、毎日
  await labeled(common, "終了日").locator("input").fill(addDays(SHOOTING_DATE, 2));
  await blur(page);
  const note = common.locator(".injection-days__note");
  await note.waitFor();
  await mark(labeled(common, "終了日"), { label: 1, place: "corner" });
  await mark(labeled(common, "実施パターン"), { label: 2 });
  await mark(note, { label: 3 });
  await shot("03-series", { target: common, padding: 40 });
  await clearMarks();

  // 医薬品を選ぶ
  const rp = form.locator("fieldset.rp-card").first();
  await rp.getByRole("button", { name: "医薬品を選択" }).click();
  let modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill("ソルデム3A輸液 500mL");
  const fluidRow = modal.getByRole("row").filter({ hasText: "ソルデム３Ａ輸液　５００ｍＬ" }).first();
  await fluidRow.waitFor();
  await blur(page);
  await mark(modal.locator(".master-search__mode"), { label: 1 });
  await mark(modal.getByRole("textbox").first(), { label: 2 });
  await mark(fluidRow, { label: 3 });
  await shot("04-medicine", { target: modal });
  await clearMarks();
  await pickRow(fluidRow);
  await modal.waitFor({ state: "detached" });
  await rp.locator(".rp-card__dose-input").first().fill("1");

  // 混注する医薬品を足す
  await rp.getByRole("button", { name: "+ 医薬品追加" }).click();
  modal = page.locator(".modal");
  await modal.getByPlaceholder(SEARCH_PLACEHOLDER).first().fill("アドナ注(静脈用)50mg");
  const additiveRow = modal.getByRole("row").filter({ hasText: "アドナ注（静脈用）５０ｍｇ" }).first();
  await additiveRow.waitFor();
  await pickRow(additiveRow);
  await modal.waitFor({ state: "detached" });
  await rp.locator(".rp-card__dose-input").nth(1).fill("1");
  await blur(page);
  const medicines = rp.locator(".rp-card__medicines");
  const total = rp.locator(".injection-total");
  await total.filter({ hasText: "mL" }).waitFor();
  await mark(rp.locator(".rp-card__dose-input").first(), { label: 1, place: "corner" });
  await mark(rp.locator(".rp-card__medicine-unit select").first(), { label: 2, place: "corner" });
  await mark(rp.getByRole("button", { name: "+ 医薬品追加" }), { label: 3 });
  await mark(total, { label: 4, place: "corner" });
  await shot("05-dose", { target: [medicines, total], padding: 40 });
  await clearMarks();

  // 用法
  const usage = rp.locator(".injection-usage");
  await labeled(usage, "手技").locator("select").selectOption({ label: "静脈注射" });
  await labeled(usage, "ライン").locator("select").selectOption({ label: "末梢ルート" });
  await labeled(usage, "投与時間").locator("select").selectOption({ label: "2時間" });
  await blur(page);
  await mark(labeled(usage, "用法種別"), { label: 1, place: "corner" });
  await mark(labeled(usage, "投与経路"), { label: 2, place: "corner" });
  await mark(labeled(usage, "投与部位"), { label: 3, place: "corner" });
  await mark(labeled(usage, "手技"), { label: 4, place: "corner" });
  await mark(labeled(usage, "ライン"), { label: 5, place: "corner" });
  await mark(labeled(usage, "投与時間"), { label: 6, place: "corner" });
  await mark(labeled(usage, "投与速度"), { label: 7, place: "corner" });
  await shot("06-usage", { target: usage, padding: 40 });
  await clearMarks();

  // 開始・終了時刻
  const times = rp.locator(".injection-start-times");
  await times.getByRole("button", { name: "+ 開始時刻追加" }).click();
  await times.getByLabel("1 回目の開始時刻").fill("10:00");
  await blur(page);
  await mark(times.getByLabel("1 回目の開始時刻"), { label: 1 });
  await mark(times.getByLabel("1 回目の終了時刻"), { label: 2, place: "corner" });
  await mark(times.getByRole("button", { name: "+ 開始時刻追加" }), { label: 3 });
  await shot("07-times", { target: times, padding: 40 });
  await clearMarks();

  // 補足と RP の追加
  const addRp = form.locator(".prescription-form__actions");
  await rp.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(rp.getByRole("button", { name: "この医薬品の操作" }).first(), { label: 1, place: "corner" });
  await mark(rp.getByRole("button", { name: "＋用法コメント" }), { label: 2 });
  await mark(addRp.getByRole("button", { name: "+ RP追加" }), { label: 3 });
  await shot("08-more", { target: [rp, addRp], padding: 40 });
  await clearMarks();

  // 登録
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(submit, { label: 1 });
  await shot("09-submit", { target: [addRp, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  await form.waitFor({ state: "detached" });
  // 連日の 1 日目のカードには「連日 N日目」が付かない。
  await page.locator(INJECTION_CARD).nth(2).waitFor();
  const card = page.locator(INJECTION_CARD).filter({ hasNotText: "日目" }).first();
  await card.waitFor();
  await shot("10-card", { target: card });

  // 登録した注射の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "中止"), { label: 3 });
  await mark(menuItem(page, "削除"), { label: 4 });
  await shot("11-card-menu", { target: [card, menu] });
  await clearMarks();

  // 編集の反映範囲
  await menuItem(page, "編集").click();
  const scope = page.locator(".karte-right .injection-scope");
  await scope.waitFor();
  await page.locator(".karte-right .prescription-form").waitFor();
  await mark(scope, { label: 1 });
  await shot("12-edit-scope", { target: [scope, page.locator(".karte-right .prescription-form fieldset").first()], padding: 40 });
  await clearMarks();
  await page.locator(".karte-right").getByRole("button", { name: "閉じる" }).click();
  await scope.waitFor({ state: "detached" });

  // 中止
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "中止").click();
  modal = page.locator(".modal").filter({ hasText: "注射の中止" });
  await modal.getByRole("button", { name: "この日のみ中止" }).waitFor();
  await mark(modal.getByRole("button", { name: "この日のみ中止" }), { label: 1, place: "corner" });
  await mark(modal.getByRole("button", { name: /^この日以降/ }), { label: 2, place: "corner" });
  await shot("13-cancel", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "キャンセル" }).click();
  await modal.waitFor({ state: "detached" });

  // 削除
  await card.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "削除").click();
  modal = page.locator(".modal").filter({ hasText: "注射の削除" });
  await modal.getByRole("combobox").fill("誤入力");
  await blur(page);
  await mark(modal.getByRole("combobox"), { label: 1 });
  await mark(modal.getByRole("button", { name: "この日のみ削除" }), { label: 2, place: "corner" });
  await mark(modal.getByRole("button", { name: /^この日以降/ }), { label: 3, place: "corner" });
  await shot("14-delete", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: /^この日以降/ }).click();
  await modal.waitFor({ state: "detached" });
  await page.locator(INJECTION_CARD).first().waitFor({ state: "detached" });
}
