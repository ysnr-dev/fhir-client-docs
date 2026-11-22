// 操作マニュアル「通知」(docs/manual/notifications.md)
// 入院中の「見本 太郎」(主治医は撮影の医師)に、早期警告に当たるバイタルを入れて、主治医あての通知を出して撮る。
// 撮影の前後に、この患者の撮影日のバイタルを削除する(未対応の通知も一緒に取り下がる)。
import { blur, dayGroup, deleteAllCards, openKarte } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const PATIENT = "見本 太郎";
const VITAL_CARD = ".karte-card--vital";

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("doctor");
  await openKarte(page, PATIENT);
  const todaysVitals = dayGroup(page, SHOOTING_DATE).locator(VITAL_CARD);
  await deleteAllCards(page, todaysVitals);

  // 早期警告に当たるバイタルを入れる(発熱・頻脈・頻呼吸・低血圧・SpO2 低下)。
  await page.locator(".karte-right").getByRole("button", { name: "バイタル", exact: true }).click();
  const form = page.locator(".karte-right form");
  await form.getByLabel("収縮期血圧").fill("88");
  await form.getByLabel("拡張期血圧").fill("52");
  await form.getByLabel("体温").fill("39.1");
  await form.getByLabel("脈拍").fill("128");
  await form.getByLabel("呼吸数").fill("26");
  await form.getByLabel("SpO2").fill("91");
  await form.getByRole("button", { name: "登録", exact: true }).click();
  await form.waitFor({ state: "detached" });
  await todaysVitals.first().waitFor();

  // ベルと新着のトースト
  const bell = page.locator(".notification-bell");
  const toast = page.locator(".notification-toast").first();
  await page.locator(".notification-bell--alert").waitFor();
  await toast.waitFor();
  await blur(page);
  await mark(bell, { label: 1 });
  await mark(toast, { label: 2 });
  await shot("01-bell", { target: [bell, toast], padding: 40 });
  await clearMarks();
  await toast.locator(".notification-toast__close").click();

  // 通知の一覧
  await bell.click();
  await page.waitForURL("**/notifications");
  const row = page.getByRole("row").filter({ hasText: PATIENT });
  await row.waitFor();
  await mark(page.getByLabel("強度"), { label: 1 });
  await mark(page.getByLabel("種別"), { label: 2, place: "corner" });
  await mark(page.locator(".notification__filter").filter({ hasText: "自分あてのみ" }), { label: 3, place: "corner" });
  await mark(row.getByRole("link", { name: "カルテ" }), { label: 4 });
  await mark(row.getByRole("button", { name: "確認", exact: true }), { label: 5, place: "corner" });
  await shot("02-list", { target: [page.locator(".page__header"), page.locator("table")], padding: 24 });
  await clearMarks();

  // 片付け: 通知を確認してからバイタルを消す。
  await row.getByRole("button", { name: "確認", exact: true }).click();
  await row.waitFor({ state: "detached" });
  await openKarte(page, PATIENT);
  await deleteAllCards(page, todaysVitals);
}
