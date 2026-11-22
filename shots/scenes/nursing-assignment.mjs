// 操作マニュアル「業務分担」(docs/manual/nursing-assignment.md)
// 看護 次郎が見本病棟の撮影日の業務分担を入れて保存する。撮影の前後に、撮影日の割り付けを画面のクリアと保存で消す。
import { openNursingMenu } from "../lib/nursing.mjs";

const SHIFTS = ["日勤", "準夜", "深夜"];

export default async function ({ page, login, mark, clearMarks, shot }) {
  await login("nurse");
  await openNursingMenu(page, "業務分担");
  const table = page.locator("table").first();
  const save = page.getByRole("button", { name: "保存", exact: true });
  const shiftMenu = (shift) => table.locator("th").filter({ hasText: shift }).locator(".row-menu__trigger");
  const menuItem = (shift, text) => table.locator("th").filter({ hasText: shift }).locator(".row-menu__item", { hasText: text });
  const row = (name) => table.getByRole("row").filter({ hasText: name });
  const cell = (name, shift) => row(name).locator("select").nth(SHIFTS.indexOf(shift));
  await row("見本 秋子").waitFor();
  await page.waitForLoadState("networkidle");

  const clearAll = async () => {
    for (const shift of SHIFTS) {
      await shiftMenu(shift).click();
      await menuItem(shift, "クリア").click();
    }
    if (await save.isEnabled()) {
      await save.click();
      await page.waitForLoadState("networkidle");
    }
  };
  await clearAll();

  // 担当看護師で埋める
  await shiftMenu("日勤").click();
  const fill = menuItem("日勤", "担当看護師で埋める");
  await mark(shiftMenu("日勤"), { label: 1, place: "corner" });
  await mark(fill, { label: 2 });
  await shot("01-fill", { target: [table, fill] });
  await clearMarks();
  await fill.click();

  // 空いている枠を選ぶ
  await cell("見本 太郎", "日勤").selectOption({ label: "看護 花子" });
  await cell("見本 太郎", "準夜").selectOption({ label: "看護 花子" });
  await cell("見本 秋子", "準夜").selectOption({ label: "看護 花子" });
  await cell("見本 太郎", "深夜").selectOption({ label: "看護 次郎" });
  await cell("見本 秋子", "深夜").selectOption({ label: "看護 次郎" });
  await page.mouse.move(960, 1000);
  await mark(cell("見本 太郎", "日勤"), { label: 1, place: "corner" });
  await mark(page.getByRole("button", { name: "前日複写" }), { label: 2, place: "corner" });
  await mark(save, { label: 3, place: "corner" });
  await shot("02-edit", { target: [page.locator(".page__header"), table] });
  await clearMarks();

  // 保存する
  await save.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const summary = page.getByText("日勤", { exact: true }).last().locator("..").locator("..");
  await shot("03-saved", { target: [table, summary] });

  await clearAll();
}
