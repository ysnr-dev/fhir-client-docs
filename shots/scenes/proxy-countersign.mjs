// 操作マニュアル「代行入力とカルテ承認」(docs/manual/proxy-countersign.md)
// 看護師(看護 次郎)が医師 四郎の指示で見本 花子の処方を代行入力し、医師 四郎が承認する。
// 医師事務作業補助者(事務 梅子)が医師 四郎の診療記録を代行入力し、医師 四郎が承認する。
// 続いて研修医(研修 五郎)が診療記録を確定し、指導医の医師 四郎がカルテ承認で承認する。
// 撮影の前後に、撮影日の処方と診療記録を医師 四郎で削除して、毎回同じ画面から始める。
import { dayGroup, deleteAllCards, fhirApi, logout, menuItem, openKarte, patientIdOf, pickRow } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 花子";
const DOCTOR = "医師 四郎";
const SEARCH_PLACEHOLDER = "部分一致で検索(かな・全半角の違いは無視)";

export default async function ({ page, login, mark, clearMarks, shot }) {
  const cards = (selector) => dayGroup(page, SHOOTING_DATE).locator(selector);
  const cleanUp = async () => {
    await login("doctor");
    await openKarte(page, PATIENT);
    await deleteAllCards(page, cards(".karte-card--prescription"));
    await deleteAllCards(page, cards(".karte-card--note"));
    await removeCountersignTasks(page, patientIdOf(page));
    await logout(page);
  };
  await cleanUp();

  // 看護師が指示医師を選ぶ
  await login("nurse");
  await openKarte(page, PATIENT);
  const context = page.locator(".order-context");
  await mark(context, { label: 1, place: "corner" });
  await shot("01-context", { target: context, padding: 40 });
  await clearMarks();
  // 開いたメニューの医師の列には開発環境の実在の人名が並ぶので、メニューは撮らない。
  await context.locator(".order-context__trigger").click();
  const pickerMenu = context.locator(".order-context__menu");
  await pickerMenu.getByRole("button", { name: "内科", exact: true }).click();
  await pickerMenu.locator(".order-context__column").nth(1).getByRole("button", { name: DOCTOR, exact: true }).click();
  await pickerMenu.waitFor({ state: "detached" });
  await mark(context, { label: 1, place: "corner" });
  await shot("02-context-set", { target: context, padding: 40 });
  await clearMarks();

  // 代行入力で処方を出す
  const right = page.locator(".karte-right");
  await right.getByRole("button", { name: "処方", exact: true }).click();
  const form = page.locator(".prescription-form");
  const rp = form.locator("fieldset.rp-card").first();
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
  await form.getByRole("button", { name: "登録", exact: true }).click();
  const proxyRxCard = cards(".karte-card--prescription").first();
  await proxyRxCard.locator(".karte-card__meta", { hasText: "代行入力" }).waitFor();
  await mark(proxyRxCard.locator(".karte-card__meta"), { label: 1, place: "corner" });
  await shot("03-proxy-order", { target: proxyRxCard, padding: 16 });
  await clearMarks();
  await logout(page);

  // 医師が承認する
  await login("doctor");
  await openKarte(page, PATIENT);
  const rxCard = cards(".karte-card--prescription").first();
  await rxCard.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "詳細表示").click();
  modal = page.locator(".modal").last();
  const approve = modal.getByRole("button", { name: "承認", exact: true });
  await approve.waitFor();
  const enteredBy = modal.locator("dt", { hasText: /^代行入力$/ });
  const approvalRow = modal.locator("dt", { hasText: /^承認$/ });
  await mark(enteredBy.locator("xpath=following-sibling::dd[1]"), { label: 1, place: "corner" });
  await mark(approve, { label: 2, place: "corner" });
  await shot("04-approve", { target: [enteredBy, approve, enteredBy.locator("xpath=following-sibling::dd[1]")], padding: 48 });
  await clearMarks();
  await approve.click();
  await approve.waitFor({ state: "detached" });
  await mark(approvalRow.locator("xpath=following-sibling::dd[1]"), { label: 1, place: "corner" });
  await shot("05-approved", { target: [enteredBy, approvalRow.locator("xpath=following-sibling::dd[1]")], padding: 48 });
  await clearMarks();
  await page.keyboard.press("Escape");
  await logout(page);

  // 医師事務作業補助者が医師の診療記録を代行入力する
  await login("clerk");
  await openKarte(page, PATIENT);
  await context.locator(".order-context__trigger").click();
  const contextMenu = context.locator(".order-context__menu");
  await contextMenu.getByRole("button", { name: "内科", exact: true }).click();
  await contextMenu.locator(".order-context__column").nth(1).getByRole("button", { name: DOCTOR, exact: true }).click();
  await context.locator(".order-context__menu").waitFor({ state: "detached" });
  await right.getByRole("button", { name: "診療記録", exact: true }).click();
  let editors = right.locator(".ProseMirror");
  await editors.first().waitFor();
  await editors.nth(0).click();
  await page.keyboard.type("朝の血圧は 130 台。めまいなし。");
  await editors.nth(1).click();
  await page.keyboard.type("血圧 132/82mmHg、脈拍 70/分。");
  await editors.nth(2).click();
  await page.keyboard.type("高血圧症。コントロール良好。");
  await editors.nth(3).click();
  await page.keyboard.type("処方継続。");
  await right.getByRole("button", { name: "登録", exact: true }).click();
  let noteCard = cards(".karte-card--note").first();
  await noteCard.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(noteCard.getByText("承認待ち"), { label: 1, place: "corner" });
  await mark(noteCard.locator(".karte-card__meta"), { label: 2, place: "corner" });
  await shot("06-proxy-note", { target: noteCard, padding: 16 });
  await clearMarks();
  await logout(page);

  // 医師が代行入力の記録を承認する
  await login("doctor");
  await openKarte(page, PATIENT);
  noteCard = cards(".karte-card--note").first();
  await noteCard.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "詳細表示").click();
  modal = page.locator(".modal").last();
  let panel = modal.locator("fieldset").filter({ has: page.locator("legend", { hasText: "代行入力" }) });
  await panel.getByRole("button", { name: "承認", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const enterer = panel.locator("dt", { hasText: /^入力者$/ }).locator("xpath=following-sibling::dd[1]");
  await enterer.waitFor();
  await mark(enterer, { label: 1, place: "corner" });
  await mark(panel.getByRole("button", { name: "承認", exact: true }), { label: 2, place: "corner" });
  await mark(panel.getByRole("button", { name: "差戻し", exact: true }), { label: 3, place: "corner" });
  await shot("07-proxy-note-approve", { target: panel, padding: 24 });
  await clearMarks();
  await panel.getByRole("button", { name: "承認", exact: true }).click();
  await panel.getByText("承認済").first().waitFor();
  await page.keyboard.press("Escape");
  // 研修医の記録の写真に写らないよう、代行入力の記録を消しておく。
  await deleteAllCards(page, cards(".karte-card--note"));
  await logout(page);

  // 研修医が診療記録を確定する
  await login("resident");
  await openKarte(page, PATIENT);
  await right.getByRole("button", { name: "診療記録", exact: true }).click();
  editors = right.locator(".ProseMirror");
  await editors.first().waitFor();
  await editors.nth(0).click();
  await page.keyboard.type("めまい・動悸なし。服薬はできている。");
  await editors.nth(1).click();
  await page.keyboard.type("血圧 134/80mmHg、脈拍 72/分。");
  await editors.nth(2).click();
  await page.keyboard.type("高血圧症。コントロール良好。");
  await editors.nth(3).click();
  await page.keyboard.type("処方継続。4 週後に再診。");
  await right.getByRole("button", { name: "登録", exact: true }).click();
  noteCard = cards(".karte-card--note").first();
  await noteCard.waitFor();
  await page.waitForLoadState("networkidle");
  const pendingBadge = noteCard.getByText("承認待ち");
  await mark(pendingBadge, { label: 1, place: "corner" });
  await shot("08-resident-note", { target: noteCard, padding: 16 });
  await clearMarks();
  await logout(page);

  // 指導医がカルテ承認で承認する
  await login("doctor");
  await page.goto("/countersigns");
  const row = page.locator("tbody tr").filter({ hasText: "研修 五郎" }).first();
  await row.waitFor();
  await page.waitForLoadState("networkidle");
  const filters = page.locator(".patient-search-form");
  await mark(filters, { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "開く" }), { label: 2, place: "corner" });
  await mark(row.getByRole("link", { name: "カルテ" }), { label: 3, place: "corner" });
  await shot("09-list", { target: [page.locator("h1"), page.locator("table")], padding: 24 });
  await clearMarks();
  await row.getByRole("button", { name: "開く" }).click();
  modal = page.locator(".modal").last();
  panel = modal.locator("fieldset").filter({ has: page.locator("legend", { hasText: "カウンターサイン" }) });
  await panel.waitFor();
  await mark(panel.getByRole("button", { name: "承認", exact: true }), { label: 1, place: "corner" });
  await mark(panel.getByRole("button", { name: "差戻し", exact: true }), { label: 2, place: "corner" });
  await mark(panel.getByLabel("コメント"), { label: 3, place: "corner" });
  await shot("10-countersign", { target: panel, padding: 24 });
  await clearMarks();
  await panel.getByRole("button", { name: "承認", exact: true }).click();
  await panel.getByText("承認済").first().waitFor();
  await page.keyboard.press("Escape");
  await logout(page);

  await cleanUp();
}

/**
 * 患者のカルテ承認・差戻しの通知を消す。研修医の記録をカルテから削除しても通知は残るので、直接消す。
 * 種別のコードで引き、念のため患者でも絞ってから消す。
 */
async function removeCountersignTasks(page, patientId) {
  const api = await fhirApi(page);
  for (const code of ["note-countersign", "note-returned"]) {
    const tasks = await api.search("Task", { code, _count: "500" });
    for (const task of tasks) {
      const isCode = task.code?.coding?.some((c) => c.code === code);
      if (isCode && task.for?.reference === `Patient/${patientId}`) await api.remove("Task", task.id);
    }
  }
}

/**
 * ログアウトする。看護師で処方を登録した直後のログアウトは、ログイン画面が出てもセッションが残ることがあるので、
 * Cookie も消して次のログインを確実にする。
 */
