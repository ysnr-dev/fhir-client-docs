// 操作マニュアル「病名」(docs/manual/condition.md)
// 外来の「見本 花子」(撮影用データに高血圧症のプロブレムがある)に、プロブレム「脂質異常症の疑い」を登録して撮る。
// 撮影の前後に、高血圧症以外の病名を病名タブから削除して、毎回同じ画面から始める。
import { blur, labeled, menuItem, openKarte, pickRow } from "../lib/karte.mjs";

const PATIENT = "見本 花子";
const KEEP = "高血圧症";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const tab = page.locator(".karte-tabs__list").getByRole("tab", { name: "病名", exact: true });
  await tab.click();
  const left = page.locator(".karte-left");
  const table = left.locator("table.patient-table");
  await table.waitFor();
  await deleteConditionsExcept(page, table, KEEP);

  // 病名タブを開く
  const create = left.getByRole("button", { name: "新規登録" });
  await mark(tab, { label: 1, place: "corner" });
  await mark(create, { label: 2, place: "corner" });
  await shot("01-tab", { target: [page.locator(".karte-tabs__list"), table, create], padding: 24 });
  await clearMarks();
  await create.click();

  // 区分と入力方法
  const form = left.locator("form.prescription-form");
  const diseaseSet = form.locator("fieldset").first();
  await diseaseSet.waitFor();
  await form.getByLabel("プロブレム", { exact: true }).check();
  await blur(page);
  await mark(diseaseSet.locator(".clinical-note-form__mode").first(), { label: 1, place: "corner" });
  await mark(diseaseSet.locator(".condition-form__input-mode"), { label: 2, place: "corner" });
  await mark(diseaseSet.getByRole("button", { name: "病名選択" }), { label: 3, place: "corner" });
  await shot("02-category", { target: diseaseSet, padding: 40 });
  await clearMarks();

  // 病名を選ぶ
  await diseaseSet.getByRole("button", { name: "病名選択" }).click();
  let modal = page.locator(".modal");
  await modal.getByRole("textbox").first().fill("脂質異常症");
  const diseaseRow = modal.getByRole("row").filter({ has: page.getByRole("cell", { name: "脂質異常症", exact: true }) });
  await diseaseRow.waitFor();
  await blur(page);
  await mark(modal.getByRole("textbox").first(), { label: 1 });
  await mark(diseaseRow, { label: 2 });
  await shot("03-disease", { target: modal });
  await clearMarks();
  await pickRow(diseaseRow);
  await modal.waitFor({ state: "detached" });

  // 疑い病名と修飾語
  await form.getByLabel("疑い病名").check();
  const preview = diseaseSet.locator(".condition-form__preview");
  await preview.filter({ hasText: "脂質異常症の疑い" }).waitFor();
  await blur(page);
  await mark(form.getByLabel("疑い病名").locator(".."), { label: 1 });
  await mark(diseaseSet.getByRole("button", { name: "+ 接頭語追加" }), { label: 2, place: "corner" });
  await mark(diseaseSet.getByRole("button", { name: "+ 接尾語追加" }), { label: 3, place: "corner" });
  await mark(preview, { label: 4 });
  await mark(preview.getByRole("button", { name: "頻用登録" }), { label: 5, place: "corner" });
  await shot("04-modifier", { target: diseaseSet, padding: 40 });
  await clearMarks();

  // 経過とプロブレムの関連
  const course = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "経過" }) });
  const relation = form.locator("fieldset").filter({ has: page.locator("legend", { hasText: "プロブレムの関連" }) });
  const submitArea = form.locator(".prescription-form__submit");
  await course.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await mark(labeled(course, "開始日"), { label: 1, place: "corner" });
  await mark(labeled(course, "終了日"), { label: 2, place: "corner" });
  await mark(labeled(course, "転帰区分"), { label: 3, place: "corner" });
  await mark(labeled(relation, "親プロブレム"), { label: 4 });
  await mark(relation.getByRole("combobox", { name: "引き継ぎ先を追加" }), { label: 5 });
  await mark(submitArea.getByRole("button", { name: "登録", exact: true }), { label: 6 });
  await shot("05-course", { target: [course, relation, submitArea], padding: 40 });
  await clearMarks();
  await submitArea.getByRole("button", { name: "登録", exact: true }).click();

  // 登録した病名
  const row = table.getByRole("row").filter({ hasText: "脂質異常症の疑い" });
  await row.waitFor();
  await row.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__popover, [role=menu]").last();
  await menu.waitFor();
  await mark(row.getByRole("button", { name: "表示" }), { label: 1 });
  await mark(menuItem(page, "編集"), { label: 2 });
  await mark(menuItem(page, "削除"), { label: 3 });
  await shot("06-list", { target: [table, menu], padding: 12 });
  await clearMarks();
  await page.keyboard.press("Escape");

  // カルテのプロブレムの帯
  await page.locator(".karte-tabs__list").getByRole("tab", { name: "カルテ", exact: true }).click();
  const band = page.locator(".karte-problems");
  const chip = band.getByRole("button", { name: /脂質異常症の疑い/ });
  await chip.waitFor();
  await mark(chip, { label: 1, place: "corner" });
  await shot("07-band", { target: band, padding: 24 });
  await clearMarks();

  // 一括転帰
  await tab.click();
  await left.getByRole("button", { name: "一括転帰" }).click();
  modal = page.locator(".modal").filter({ hasText: "病名の一括変更" });
  await modal.waitFor();
  await modal.getByRole("checkbox", { name: "脂質異常症の疑い を選択" }).check();
  await modal.locator("select").selectOption({ label: "中止" });
  await blur(page);
  await mark(modal.locator(".clinical-note-form__mode-options"), { label: 1 });
  await mark(labeled(modal, "転帰区分"), { label: 2, place: "corner" });
  await mark(labeled(modal, "終了日"), { label: 3, place: "corner" });
  await mark(modal.getByRole("checkbox", { name: "脂質異常症の疑い を選択" }), { label: 4 });
  await mark(modal.locator(".condition-bulk__actions button").first(), { label: 5 });
  await shot("08-bulk", { target: modal });
  await clearMarks();
  await modal.getByRole("button", { name: "キャンセル" }).click();
  await modal.waitFor({ state: "detached" });

  await deleteConditionsExcept(page, table, KEEP);
}

/** 病名の一覧から、keep を含まない行をすべて削除する(削除の確認はブラウザの確認画面なので、承諾して進める)。 */
async function deleteConditionsExcept(page, table, keep) {
  await page.waitForLoadState("networkidle");
  const rows = table.locator("tbody tr").filter({ hasNotText: keep });
  const accept = (dialog) => dialog.accept();
  page.on("dialog", accept);
  try {
    for (let remaining = await rows.count(); remaining > 0; remaining = await rows.count()) {
      await rows.first().getByRole("button", { name: /の操作$/ }).click();
      await menuItem(page, "削除").click();
      await page.waitForFunction(
        ({ count, keep }) =>
          [...document.querySelectorAll(".karte-left table.patient-table tbody tr")].filter(
            (tr) => !tr.textContent.includes(keep),
          ).length < count,
        { count: remaining, keep },
      );
    }
  } finally {
    page.off("dialog", accept);
  }
}
