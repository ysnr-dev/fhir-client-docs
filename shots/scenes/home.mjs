// 操作マニュアル「ホーム・掲示板」(docs/manual/home.md)
// 撮影の医師のホーム(保存した設定なし = 医師の既定のカード)と、掲示板への投稿を撮る。
// 投稿は撮影の中で作って、最後に削除する。ホームの編集は保存せずに閉じる。
import { blur } from "../lib/karte.mjs";
import { SHOOTING_DATE } from "../lib/session.mjs";

const POST_TITLE = "2月の院内感染対策研修";
const POST_BODY = "2月15日(月) 17:30〜18:30 に講堂で行います。\n全職員が対象です。出席できない人は後日の録画視聴で受講してください。";

export default async function ({ page, login, mark, clearMarks, shot }) {
  // 投稿の削除は確認のダイアログで「OK」を押す。
  page.on("dialog", (dialog) => dialog.accept());
  await login("doctor");
  await deletePosts(page);

  // ホーム
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const header = page.locator(".app__header");
  await blur(page);
  await mark(header.locator(".app__title"), { label: 1 });
  await mark(header.locator(".app__nav"), { label: 2, place: "corner" });
  await mark(header.locator(".notification-bell"), { label: 3, place: "corner" });
  await mark(page.locator(".home__grid > *").first(), { label: 4, place: "corner" });
  await mark(page.locator(".page__header").getByRole("button", { name: "編集", exact: true }), { label: 5, place: "corner" });
  await shot("01-home");
  await clearMarks();

  // メニュー
  const menu = header.locator(".hover-menu").filter({ hasText: "患者一覧" });
  await menu.locator(".hover-menu__trigger").hover();
  const items = menu.locator(".hover-menu__items");
  await items.waitFor();
  await shot("02-menu", { target: [header.locator(".app__title"), items], padding: 24 });
  await page.mouse.move(960, 600);
  await items.waitFor({ state: "detached" });

  // ホームの編集(保存しない)
  await page.locator(".page__header").getByRole("button", { name: "編集", exact: true }).click();
  const editor = page.locator(".modal").filter({ hasText: "ホームの編集" });
  await editor.locator(".home-editor__items").waitFor();
  const row = editor.locator(".home-editor__items tbody tr").filter({ hasText: "本日の外来" });
  await mark(row.getByRole("button", { name: "上へ" }), { label: 1, place: "corner" });
  await mark(row.getByRole("button", { name: "下へ" }));
  await mark(row.locator(".home-editor__settings select"), { label: 2 });
  await mark(row.getByRole("button", { name: /を削除$/ }), { label: 3, place: "corner" });
  await mark(editor.locator(".home-editor__add"), { label: 4 });
  await mark(editor.getByRole("button", { name: "保存", exact: true }), { label: 5 });
  await shot("03-edit", { target: editor });
  await clearMarks();
  await editor.getByRole("button", { name: "取消", exact: true }).click();
  await editor.waitFor({ state: "detached" });

  // 掲示板に投稿する
  await page.goto("/bulletin");
  await page.locator(".bulletin__list").waitFor();
  await page.locator(".page__header").getByRole("button", { name: "投稿", exact: true }).click();
  const form = page.locator(".modal").filter({ hasText: "掲示板に投稿" });
  await form.getByLabel("件名").fill(POST_TITLE);
  await form.getByLabel("本文").fill(POST_BODY);
  await form.getByLabel("掲載開始日").fill(SHOOTING_DATE);
  await form.getByLabel("掲載終了日").fill("2027-02-15");
  await blur(page);
  await mark(form.getByLabel("件名"), { label: 1 });
  await mark(form.getByLabel("本文"), { label: 2 });
  await mark(form.locator("label").filter({ hasText: "掲載開始日" }), { label: 3, place: "corner" });
  await mark(form.locator("label").filter({ hasText: "掲載終了日" }), { label: 4, place: "corner" });
  await mark(form.locator(".bulletin-form__check"), { label: 5, place: "corner" });
  await mark(form.getByRole("button", { name: "投稿", exact: true }), { label: 6 });
  await shot("04-post", { target: form });
  await clearMarks();
  await form.getByRole("button", { name: "投稿", exact: true }).click();
  await form.waitFor({ state: "detached" });

  // 掲示板の一覧
  const post = page.locator(".bulletin__post").filter({ hasText: POST_TITLE });
  await post.waitFor();
  await mark(page.locator(".page__header").getByRole("button", { name: "投稿", exact: true }), { label: 1 });
  await mark(post.getByRole("button", { name: "編集", exact: true }), { label: 2 });
  await shot("05-bulletin", { target: [page.locator(".page__header"), page.locator(".bulletin__list")], padding: 24 });
  await clearMarks();

  // ホームの掲示板のカード
  await page.goto("/");
  const card = page.locator(".home__grid > *").first();
  await card.filter({ hasText: POST_TITLE }).waitFor();
  await shot("06-home-bulletin", { target: card });

  await deletePosts(page);
}

/** 撮影で投稿したお知らせを、掲示板の「編集」の「削除」で消す。 */
async function deletePosts(page) {
  await page.goto("/bulletin");
  await page.waitForLoadState("networkidle");
  const posts = page.locator(".bulletin__post").filter({ hasText: POST_TITLE });
  for (let remaining = await posts.count(); remaining > 0; remaining = await posts.count()) {
    await posts.first().getByRole("button", { name: "編集", exact: true }).click();
    const modal = page.locator(".modal").filter({ hasText: "投稿を編集" });
    await modal.getByRole("button", { name: "削除", exact: true }).click();
    await modal.waitFor({ state: "detached" });
    await posts.nth(remaining - 1).waitFor({ state: "detached" });
  }
}
