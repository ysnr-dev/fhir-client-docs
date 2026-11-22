// 操作マニュアル「患者検索とカルテを開く」(docs/manual/patient-search.md)
// 氏名「見本」で撮影用の患者(見本 花子・見本 太郎)だけに絞ってから撮る。
// 患者検索は開いた直後に全患者を並べるので、検索する前の一覧は撮らない。
import { blur } from "../lib/karte.mjs";

const PATIENT = "見本 花子";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");

  // 患者検索で探す
  await page.goto("/patients");
  const form = page.locator(".patient-search-form");
  await form.getByLabel("氏名(漢字・カナ部分一致)").fill("見本");
  await form.getByRole("button", { name: "検索", exact: true }).click();
  const table = page.locator(".patient-table");
  const row = table.getByRole("row").filter({ hasText: PATIENT });
  await row.waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".patient-table tbody tr").length === 2);
  await page.waitForLoadState("networkidle");
  await blur(page);
  await mark(form.locator("label").filter({ hasText: "氏名" }), { label: 1, place: "corner" });
  await mark(form.locator("label").filter({ hasText: "患者番号" }), { label: 2, place: "corner" });
  await mark(form.getByRole("button", { name: "検索", exact: true }), { label: 3, place: "corner" });
  await mark(row.getByRole("link", { name: "カルテ" }), { label: 4, place: "corner" });
  await mark(row.getByRole("button", { name: /の操作$/ }), { label: 5, place: "corner" });
  await shot("01-search", { target: page.locator(".page"), padding: 24 });
  await clearMarks();

  // 行の「⋮」
  await row.getByRole("button", { name: /の操作$/ }).click();
  const menu = page.locator(".row-menu__items").last();
  await menu.waitFor();
  await shot("02-row-menu", { target: [row, menu], padding: 24 });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached" });

  // 行を押して患者プロファイルを開く
  await row.locator("td").nth(2).click();
  const drawer = page.locator(".patient-drawer");
  await drawer.waitFor();
  await page.waitForLoadState("networkidle");
  await mark(drawer.locator(".patient-drawer__actions").getByRole("link", { name: "カルテ" }), { label: 1 });
  await shot("03-drawer", { target: drawer, padding: 0 });
  await clearMarks();
  await drawer.getByRole("button", { name: "閉じる" }).click();

  // カルテを開き、「戻る」で一覧に戻る
  await row.getByRole("link", { name: "カルテ" }).click();
  await page.locator(".karte-right").waitFor();
  await page.waitForLoadState("networkidle");
  const header = page.locator(".karte-page__header");
  await mark(header.getByRole("link", { name: /戻る/ }), { label: 1 });
  await shot("04-karte-back", { target: header, padding: 24 });
  await clearMarks();
}
