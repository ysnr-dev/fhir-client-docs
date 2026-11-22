// 操作マニュアル「輸血」(docs/manual/transfusion.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者。血液型の検査が無い)に、翌日の照射赤血球液 2 単位を登録して撮る。
// 血液型が確定していないので、登録で警告の確認が出る(その写真も撮る)。
// 撮影の前後に、この患者の輸血のカードをカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const PRODUCT = "照射赤血球液-LR「日赤」2単位";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const transfusionCards = page.locator(".karte-card").filter({ hasText: "輸血" });
  await deleteAllCards(page, transfusionCards);

  // 輸血登録を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "輸血", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();

  // 警告と血液型
  const notice = form.locator(".advisory-notice").first();
  const bloodType = fieldset("血液型");
  await bloodType.waitFor();
  await page.waitForLoadState("networkidle");
  await bloodType.getByRole("group", { name: "ABO血液型" }).getByRole("button", { name: "O", exact: true }).click();
  await bloodType.getByRole("group", { name: "RhD血液型" }).getByRole("button", { name: "＋" }).click();
  await blur(page);
  await mark(notice, { label: 1 });
  await mark(bloodType.getByRole("group", { name: "ABO血液型" }), { label: 2, place: "corner" });
  await mark(bloodType.getByRole("group", { name: "RhD血液型" }), { label: 3, place: "corner" });
  await mark(bloodType.locator(".transfusion-order__patient-blood-type"), { label: 4 });
  await mark(bloodType.locator(".transfusion-order__pretest"), { label: 5 });
  await shot("02-blood-type", { target: [notice, bloodType], padding: 40 });
  await clearMarks();

  // 依頼共通
  const common = fieldset("依頼共通");
  await labeled(common, "投与予定日時").locator("input").fill(`${addDays(SHOOTING_DATE, 1)}T10:00`);
  await labeled(common, "使用目的").locator("input").fill("消化管出血による貧血");
  await blur(page);
  await common.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(labeled(common, "輸血検査区分"), { label: 1 });
  await mark(labeled(common, "対象プロブレム"), { label: 2, place: "corner" });
  await mark(labeled(common, "入外区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "緊急度"), { label: 4 });
  await mark(labeled(common, "投与予定日時"), { label: 5, place: "corner" });
  await mark(labeled(common, "使用場所"), { label: 6, place: "corner" });
  await mark(labeled(common, "使用目的"), { label: 7 });
  await mark(common.getByRole("button", { name: "＋依頼コメント" }), { label: 8 });
  await shot("03-common", { target: common, padding: 40 });
  await clearMarks();

  // 製剤と同意
  const products = fieldset("製剤");
  const product = products.locator(".transfusion-order__product").first();
  await product.locator(".transfusion-order__product-name select").selectOption({ label: PRODUCT });
  await labeled(product, "単位数").locator("input").fill("2");
  const consent = form.locator(".transfusion-order__consent");
  await consent.locator("input").check();
  await blur(page);
  await products.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(product.locator(".transfusion-order__product-name"), { label: 1 });
  await mark(labeled(product, "単位数"), { label: 2, place: "corner" });
  await mark(labeled(product, "備考"), { label: 3, place: "corner" });
  await mark(products.getByRole("button", { name: "＋製剤追加" }), { label: 4 });
  await mark(consent, { label: 5 });
  await shot("04-products", { target: [products, consent], padding: 40 });
  await clearMarks();

  // 登録と警告の確認
  const submit = form.locator(".prescription-form__actions").getByRole("button", { name: "登録", exact: true });
  await submit.scrollIntoViewIfNeeded();
  await submit.click();
  const confirm = page.locator(".modal").filter({ hasText: "警告の確認" });
  await confirm.waitFor();
  const reasons = confirm.getByRole("combobox", { name: "理由" });
  for (let i = 0; i < (await reasons.count()); i += 1) await reasons.nth(i).selectOption({ index: 1 });
  await blur(page);
  await mark(confirm.locator(".advisory-confirm-modal__head").first(), { label: 1 });
  await mark(confirm.locator(".advisory-confirm-modal__reason").first(), { label: 2 });
  await mark(confirm.getByRole("button", { name: "登録", exact: true }), { label: 3 });
  await mark(confirm.getByRole("button", { name: "戻る", exact: true }), { label: 4, place: "corner" });
  await shot("05-confirm", { target: confirm });
  await clearMarks();
  await confirm.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  const card = transfusionCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("06-card", { target: card });

  // 登録した輸血の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("07-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, transfusionCards);
}
