// 画面写真の撮影。使い方: npm run shots -- <シーン名> [<シーン名> ...] / npm run shots -- all
// シーンは shots/scenes/<シーン名>.mjs。写真は docs/manual/img/<シーン名>/ に WebP で書き出す。
// all は全シーンを名前の順に流す。途中で失敗したシーンがあっても残りを流し、最後に失敗の一覧を出す。
import { readdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createSession } from "./lib/session.mjs";

const files = await readdir(new URL("./scenes/", import.meta.url));
const scenes = files.filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, "")).sort();

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(`シーン名か all を指定してください: ${scenes.join(" ")}`);
  process.exit(1);
}
const names = args.includes("all") ? scenes : args;
const unknown = names.filter((name) => !scenes.includes(name));
if (unknown.length) {
  console.error(`シーンがありません: ${unknown.join(" ")}(${scenes.join(" ")})`);
  process.exit(1);
}

// 日付欄などブラウザが描く部品を日本語の書式にするため、--lang の効く新しいヘッドレスで起動する。
const browser = await chromium.launch({ channel: "chromium", args: ["--lang=ja-JP"] });
const failed = [];
try {
  for (const name of names) {
    console.log(`--- ${name}`);
    const { default: scene } = await import(`./scenes/${name}.mjs`);
    const session = await createSession(browser, name);
    try {
      await scene(session.api);
    } catch (error) {
      failed.push(name);
      console.error(`${name} で失敗しました`);
      console.error(error);
    } finally {
      await session.close();
    }
  }
} finally {
  await browser.close();
}
if (failed.length) {
  console.error(`失敗したシーン: ${failed.join(" ")}`);
  process.exit(1);
}
