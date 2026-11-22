// 操作マニュアル「手術」(docs/manual/surgery.md)
// 入院中の患者「見本 太郎」(撮影用の架空の患者)に、撮影日の 1 週後の腹腔鏡下胆嚢摘出術を申し込んで撮る。
// 医療従事者の選択には開発環境の全員(実在の人名を含む)が並ぶので、名前で絞ってから撮る。
// 撮影の前後に、この患者の手術のカードをカルテから削除して、毎回同じ画面から始める。
import { addDays, blur, deleteAllCards, labeled, menuItem, openKarte, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const SURGERY_DATE = addDays(SHOOTING_DATE, 7);
const PROCEDURE_CODE = "150254110";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const surgeryCards = page.locator(".karte-card").filter({ hasText: "手術" });
  await deleteAllCards(page, surgeryCards);

  // 手術申込を開く
  const pane = page.locator(".karte-right");
  const paneButton = pane.getByRole("button", { name: "手術", exact: true });
  await mark(paneButton, { label: 1 });
  await shot("01-open");
  await clearMarks();
  await paneButton.click();

  const form = pane.locator(".prescription-form");
  const fieldset = (legend) => form.locator("fieldset").filter({ has: page.locator("legend", { hasText: legend }) }).first();

  // 手術共通と日程
  const common = fieldset("手術共通");
  const schedule = fieldset("日程・手術室");
  await common.waitFor();
  await page.waitForLoadState("networkidle");
  await labeled(common, "執刀科").locator("select").selectOption({ label: "外科" });
  await labeled(schedule, "予定手術日").locator("input").fill(SURGERY_DATE);
  await labeled(schedule, "入室予定時刻").locator("input").fill("09:00");
  await labeled(schedule, "予定所要時間").locator("input").fill("150");
  await labeled(schedule, "手術室").locator("select").selectOption({ label: "手術室1" });
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(labeled(common, "対象プロブレム"), { label: 1 });
  await mark(labeled(common, "入外区分"), { label: 2, place: "corner" });
  await mark(labeled(common, "予定区分"), { label: 3, place: "corner" });
  await mark(labeled(common, "執刀科"), { label: 4, place: "corner" });
  await mark(labeled(schedule, "予定手術日"), { label: 5 });
  await mark(labeled(schedule, "入室予定時刻"), { label: 6, place: "corner" });
  await mark(labeled(schedule, "予定所要時間"), { label: 7, place: "corner" });
  await mark(labeled(schedule, "手術室"), { label: 8, place: "corner" });
  await mark(schedule.locator(".surgery-day-schedule"), { label: 9 });
  await shot("02-schedule", { target: [common, schedule], padding: 40 });
  await clearMarks();

  // 術式を選ぶ
  const procedures = form.locator("section.order-select__preview").filter({ has: page.getByRole("button", { name: "+ 術式追加" }) });
  await procedures.getByRole("button", { name: "+ 術式追加" }).click();
  let modal = page.locator(".modal").filter({ hasText: "術式を選択" });
  await labeled(modal, "名称・略称・カナ").locator("input").fill("胆嚢摘出");
  await modal.getByRole("button", { name: "検索", exact: true }).click();
  const procedureRow = modal.getByRole("row").filter({ hasText: PROCEDURE_CODE });
  await procedureRow.waitFor();
  await blur(page);
  await mark(labeled(modal, "名称・略称・カナ"), { label: 1 });
  await mark(labeled(modal, "種別"), { label: 2, place: "corner" });
  await mark(procedureRow, { label: 3 });
  await shot("03-procedure-search", { target: modal });
  await clearMarks();
  await pickRow(procedureRow);
  await modal.waitFor({ state: "detached" });

  const procedure = procedures.locator(".rad-gp").first();
  await procedure.locator('input[aria-label="術前診断"]').fill("胆嚢結石症");
  await blur(page);
  await procedures.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await mark(procedures.getByRole("button", { name: "+ 術式追加" }), { label: 1 });
  await mark(procedure.locator(".rad-gp__head"), { label: 2 });
  await mark(labeled(procedure, "部位"), { label: 3 });
  await mark(labeled(procedure, "左右"), { label: 4 });
  await mark(labeled(procedure, "到達法"), { label: 5 });
  await mark(labeled(procedure, "術前診断"), { label: 6 });
  await shot("04-procedure", { target: procedures, padding: 40 });
  await clearMarks();

  // スタッフ: 執刀医・助手・麻酔科医
  const staff = fieldset("スタッフ");
  const pickStaff = async (button, name, shotName) => {
    await staff.getByRole("button", { name: button }).click();
    const picker = page.locator(".modal").filter({ hasText: "医療従事者を選択" });
    await labeled(picker, "氏名").locator("input").fill(name);
    await picker.getByRole("button", { name: "検索", exact: true }).click();
    const row = picker.getByRole("row").filter({ hasText: name });
    await row.waitFor();
    await picker.locator("tbody tr").nth(1).waitFor({ state: "detached" }).catch(() => {});
    if (shotName) {
      await blur(page);
      await mark(labeled(picker, "氏名"), { label: 1 });
      await mark(row, { label: 2 });
      await shot(shotName, { target: picker });
      await clearMarks();
    }
    await pickRow(row);
    await picker.waitFor({ state: "detached" });
  };
  await pickStaff("+ 執刀医", "医師 四郎", "05-staff-search");
  await pickStaff("+ 助手", "研修 五郎");
  await pickStaff("+ 麻酔科医", "医師 三郎");

  // 麻酔と準備
  const anesthesia = fieldset("麻酔");
  const prep = fieldset("準備");
  await anesthesia.locator("label").filter({ hasText: /^全身麻酔\(吸入\)$/ }).locator("input").check();
  await labeled(anesthesia, "管理区分").locator("select").selectOption({ label: "麻酔科管理" });
  await labeled(prep, "輸血準備").locator("select").selectOption({ label: "T&S" });
  await labeled(prep, "手術体位").locator("select").selectOption({ label: "仰臥位" });
  await prep.locator("label").filter({ hasText: /^永久標本$/ }).locator("input").check();
  await blur(page);
  await staff.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(staff, { label: 1 });
  await mark(anesthesia.locator(".dose-conversion__checkbox").first().locator("xpath=.."), { label: 2 });
  await mark(labeled(anesthesia, "管理区分"), { label: 3 });
  await mark(labeled(prep, "輸血準備"), { label: 4, place: "corner" });
  await mark(labeled(prep, "予定出血量"), { label: 5, place: "corner" });
  await mark(labeled(prep, "手術体位"), { label: 6, place: "corner" });
  await mark(prep.getByText("特殊機器", { exact: true }), { label: 7 });
  await mark(prep.getByText("検体提出予定", { exact: true }), { label: 8 });
  await shot("06-staff-anesthesia", { target: [staff, prep], padding: 40 });
  await clearMarks();

  // 同意書・術前指示・登録
  const consent = fieldset("同意書");
  const preop = fieldset("術前指示");
  const notes = fieldset("特記・申し送り");
  await consent.locator("label").filter({ hasText: /^手術同意書$/ }).locator("input").check();
  await preop.locator("textarea").fill("前日 21 時以降絶食。当日朝の内服は医師に確認");
  await blur(page);
  const submitArea = form.locator(".prescription-form__submit");
  const submit = submitArea.getByRole("button", { name: "登録", exact: true });
  await submitArea.scrollIntoViewIfNeeded();
  await mark(consent, { label: 1 });
  await mark(preop.locator("textarea"), { label: 2 });
  await mark(preop.getByRole("button", { name: "テンプレート" }), { label: 3, place: "corner" });
  await mark(notes.locator("textarea"), { label: 4 });
  await mark(submit, { label: 5 });
  await shot("07-submit", { target: [consent, submitArea], padding: 40 });
  await clearMarks();
  await submit.click();
  // 同じ手術室・時間に重なる手術があると確認が出る。撮影日の翌週は開発データが無いので出ない想定。
  await form.waitFor({ state: "detached" });
  const card = surgeryCards.first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  await shot("08-card", { target: card });

  // 登録した手術の操作
  await card.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(card.getByRole("button", { name: /^DO/ }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("09-card-menu", { target: [card, menu] });
  await clearMarks();
  await page.keyboard.press("Escape");

  await deleteAllCards(page, surgeryCards);
}
