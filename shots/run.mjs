// 画面写真の撮影。使い方: npm run shots -- <シーン名> [<シーン名> ...]
// シーンは shots/scenes/<シーン名>.mjs。写真は docs/manual/img/<シーン名>/ に WebP で書き出す。
import { readdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createSession } from "./lib/session.mjs";

const names = process.argv.slice(2);
if (names.length === 0) {
  const files = await readdir(new URL("./scenes/", import.meta.url));
  const scenes = files.filter((f) => f.endsWith(".mjs")).map((f) => f.replace(/\.mjs$/, ""));
  console.error(`シーン名を指定してください: ${scenes.join(" ")}`);
  process.exit(1);
}

const browser = await chromium.launch();
try {
  for (const name of names) {
    const { default: scene } = await import(`./scenes/${name}.mjs`);
    const session = await createSession(browser, name);
    try {
      await scene(session.api);
    } finally {
      await session.close();
    }
  }
} finally {
  await browser.close();
}
