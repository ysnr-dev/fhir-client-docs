// 操作マニュアル「ログイン」(docs/manual/login.md)
export default async function ({ page, mark, shot }) {
  await page.goto("/");
  await page.getByLabel("ログインID").waitFor();
  await page.evaluate(() => document.activeElement?.blur());
  await mark(page.getByLabel("ログインID"), { label: 1 });
  await mark(page.getByLabel("パスワード"), { label: 2 });
  await mark(page.getByRole("button", { name: "ログイン" }), { label: 3 });
  await shot("01-login", { target: ".login-card", padding: 24 });
}
