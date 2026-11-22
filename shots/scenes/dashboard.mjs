// 操作マニュアル「分析ダッシュボード」(docs/manual/dashboard.md)
// 医師 四郎が、データ抽出に見本の条件(高血圧症 × アムロジピン、見本病棟の入院)を保存しておき、
// 新しい分析ダッシュボードにタイルを 3 つ置いて自分のダッシュボードとして保存し、実行する。
// 撮影の前後に、保存したダッシュボードと条件を消す。
import { blur, labeled, menuItem, settle } from "../lib/karte.mjs";
import {
  HYPERTENSION_QUERY,
  WARD_QUERY,
  buildHypertensionQuery,
  buildWardQuery,
  removeDashboards,
  removeQueries,
  saveQuery,
} from "../lib/data.mjs";

const DASHBOARD = "見本 内科の見張り";
const TILES = [
  { tab: "患者", query: HYPERTENSION_QUERY, view: "件数", title: "降圧薬の処方中" },
  { tab: "患者", query: HYPERTENSION_QUERY, view: "一覧", title: "" },
  { tab: "入院・外来", query: WARD_QUERY, view: "一覧", title: "" },
];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  const cleanUp = async () => {
    await removeDashboards(page, [DASHBOARD]);
    await removeQueries(page, [HYPERTENSION_QUERY, WARD_QUERY]);
  };
  await cleanUp();
  await buildHypertensionQuery(page);
  await saveQuery(page, HYPERTENSION_QUERY);
  await buildWardQuery(page);
  await saveQuery(page, WARD_QUERY);

  // タイルを置く
  await page.goto("/dashboards");
  await page.getByRole("button", { name: "編集", exact: true }).click();
  for (const [index, tile] of TILES.entries()) {
    await page.getByRole("button", { name: "タイル追加" }).click();
    const modal = page.locator(".modal").filter({ hasText: "タイルを追加" });
    await labeled(modal, "タブ").locator("select").selectOption({ label: tile.tab });
    const query = labeled(modal, "条件").locator("select");
    await query.locator("option", { hasText: tile.query }).waitFor({ state: "attached" });
    await query.selectOption({ label: tile.query });
    await labeled(modal, "表示").locator("select").selectOption({ label: tile.view });
    if (tile.title) await labeled(modal, "タイトル").locator("input").fill(tile.title);
    if (index === 0) {
      await blur(page);
      await settle(modal);
      await mark(labeled(modal, "タブ"), { label: 1 });
      await mark(labeled(modal, "条件"), { label: 2 });
      await mark(labeled(modal, "表示"), { label: 3 });
      await mark(labeled(modal, "タイトル"), { label: 4 });
      await mark(modal.getByRole("button", { name: "追加" }), { label: 5 });
      await shot("01-add-tile", { target: modal, padding: 24 });
      await clearMarks();
    }
    await modal.getByRole("button", { name: "追加" }).click();
    await modal.waitFor({ state: "detached" });
  }

  // 編集中の画面
  const grid = page.locator(".dashboard__grid");
  const firstTile = grid.locator(".dashboard-tile").first();
  await mark(page.getByRole("button", { name: "タイル追加" }), { label: 1, place: "corner" });
  await mark(page.getByRole("button", { name: "元に戻す" }), { label: 2, place: "corner" });
  await mark(firstTile.locator(".dashboard-tile__header"), { label: 3, place: "corner" });
  await mark(firstTile.locator(".dashboard-tile__resize"), { label: 4, place: "corner" });
  await mark(firstTile.getByRole("button", { name: "タイルを削除" }), { label: 5, place: "corner" });
  await mark(page.getByRole("button", { name: "保存", exact: true }), { label: 6, place: "corner" });
  await mark(page.getByRole("button", { name: "閉じる", exact: true }), { label: 7, place: "corner" });
  await shot("02-editing", { target: [page.locator(".page__header"), page.locator(".data-extract__toolbar"), grid], padding: 24 });
  await clearMarks();

  // 保存する
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const saveModal = page.locator(".modal").filter({ hasText: "分析ダッシュボードを保存" });
  await labeled(saveModal, "名前").locator("input").fill(DASHBOARD);
  await saveModal.getByRole("button", { name: "保存", exact: true }).click();
  await saveModal.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "編集", exact: true }).waitFor();

  // 実行する
  await page.getByRole("button", { name: "実行", exact: true }).click();
  await grid.getByText("見本 秋子").waitFor();
  await page.getByRole("button", { name: "実行", exact: true }).waitFor();
  await page.waitForLoadState("networkidle");
  const lastTile = grid.locator(".dashboard-tile").last();
  await lastTile.getByRole("button", { name: /の操作$/ }).click();
  await menuItem(page, "データ抽出で開く").waitFor();
  await mark(labeled(page.locator(".data-extract__toolbar"), "分析ダッシュボード"), { label: 1, place: "corner" });
  await mark(page.locator(".data-extract__toolbar").getByRole("button", { name: "実行", exact: true }), { label: 2, place: "corner" });
  await mark(firstTile.locator(".dashboard-tile__body"), { label: 3, place: "corner" });
  await mark(grid.locator(".dashboard-tile").nth(1).locator(".dashboard-tile__meta"), { label: 4, place: "corner" });
  await mark(page.locator(".row-menu__items").last(), { label: 5 });
  await shot("03-run", { target: [page.locator(".page__header"), page.locator(".data-extract__toolbar"), grid, page.locator(".row-menu__items").last()], padding: 24 });
  await clearMarks();
  await page.keyboard.press("Escape");

  await cleanUp();
}
