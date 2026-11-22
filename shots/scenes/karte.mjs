// 操作マニュアル「カルテ画面の見方」(docs/manual/karte.md)
// 外来の「見本 花子」(撮影用データに高血圧症と 2 回の受診歴がある)のカルテを、登録や削除をせずに見て回って撮る。
import { openKarte } from "../lib/karte.mjs";

const PATIENT = "見本 花子";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  await page.locator(".karte-card").first().waitFor();
  await page.waitForLoadState("networkidle");

  // 画面の全体
  await mark(page.locator(".karte-page__header"), { label: 1, place: "corner" });
  await mark(page.locator(".karte-tabs__list"), { label: 2, place: "corner" });
  await mark(page.locator(".karte-problems"), { label: 3, place: "corner" });
  await mark(page.locator(".karte-daylist"), { label: 4, place: "corner" });
  await mark(page.locator(".karte-left__timeline"), { label: 5, place: "corner" });
  await mark(page.locator(".karte-right__actions"), { label: 6, place: "corner" });
  await shot("01-overview");
  await clearMarks();

  // まとめたタブ
  const group = page.locator(".karte-tabs__group").filter({ hasText: "診療情報" });
  await group.locator(".karte-tabs__tab").hover();
  const groupMenu = page.locator(".karte-tabs__menu");
  await groupMenu.waitFor();
  await shot("02-tab-group", { target: [page.locator(".karte-tabs__list"), groupMenu], padding: 24 });
  await page.mouse.move(1500, 700);
  await groupMenu.waitFor({ state: "detached" });

  // タブ行の右端のボタン
  const actions = page.locator(".karte-tabs__actions");
  await mark(actions.getByRole("button", { name: "左ペインを別タブで開く" }), { label: 1, place: "corner" });
  await mark(actions.getByRole("button", { name: "本日のカルテを右に並べる" }), { label: 2, place: "corner" });
  await mark(actions.getByRole("button", { name: "カルテと他タブを上下に並べる" }), { label: 3, place: "corner" });
  await shot("03-tab-actions", { target: actions, padding: 32 });
  await clearMarks();

  // 左ペインの診療日と種別
  const side = page.locator(".karte-daylist");
  await mark(side.locator(".karte-sidepane__modes"), { label: 1, place: "corner" });
  await mark(side.getByRole("button", { name: "表示する記録" }), { label: 2, place: "corner" });
  await mark(side.getByRole("button", { name: "左ペインを隠す" }), { label: 3, place: "corner" });
  await shot("04-side-days", { target: [side.locator(".karte-daylist__header"), side.locator(".karte-daylist__year").last()], padding: 32 });
  await clearMarks();

  // 種別で絞り込む
  await side.getByRole("tab", { name: "種別" }).click();
  const prescriptionKind = side.getByRole("button", { name: "処方", exact: true });
  await prescriptionKind.click();
  await page.locator(".karte-card--vital").first().waitFor({ state: "detached" });
  await page.waitForLoadState("networkidle");
  await mark(prescriptionKind, { label: 1 });
  await shot("05-side-kind", { target: [side, page.locator(".karte-left__timeline")], padding: 24 });
  await clearMarks();
  await prescriptionKind.click();
  await side.getByRole("tab", { name: "診療日" }).click();
  await page.locator(".karte-card--vital").first().waitFor();

  // プロブレムで絞り込む(関連しない記録を薄くする)
  const chip = page.locator(".karte-problems").getByRole("button", { name: /高血圧症/ }).first();
  await chip.click();
  await page.locator(".karte-card--dimmed").first().waitFor();
  await mark(chip, { label: 1, place: "corner" });
  await shot("06-problem", { target: [page.locator(".karte-problems"), page.locator(".karte-left__timeline")], padding: 24 });
  await clearMarks();
  await chip.click();
}
