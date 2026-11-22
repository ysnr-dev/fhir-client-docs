// 撮影用の注釈。画面の上に赤枠と、その左外に番号の丸を重ね、撮ったあと clearMarks で外す。
// 横に並んだ部品など左外に丸を置くと隣に重なるときは、place: "corner" で枠の左上の角に置く。
// 色は写真の中だけで使うので、アプリのテーマに関わらず固定にする。
const COLOR = "#e5484d";
const PADDING = 4;

export async function mark(page, locator, { label, place = "left" } = {}) {
  // 画面に収まっている部品はスクロールしない(モーダルの中で送られると、先に付けた注釈がずれる)。
  // スクロールの枠(右ペインなど)に隠れている部品も、見えていないものとして扱う。
  const inView = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth) return false;
    for (let node = el.parentElement; node; node = node.parentElement) {
      if (!/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY)) continue;
      const box = node.getBoundingClientRect();
      if (r.top < box.top - 1 || r.bottom > box.bottom + 1) return false;
    }
    return true;
  });
  if (!inView) {
    const placed = await page.evaluate(() => document.querySelectorAll("[data-shot-mark]").length);
    if (placed > 0) console.warn(`注釈の途中でスクロールしました(先に付けた注釈がずれます): ${locator}`);
    await locator.scrollIntoViewIfNeeded();
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error(`注釈を付ける場所が見つかりません: ${locator}`);
  // 固定配置のモーダルの中は、裏の画面がスクロールしても動かないので、注釈も画面に固定して置く。
  const fixed = await locator.evaluate((el) => {
    for (let node = el; node; node = node.parentElement) if (getComputedStyle(node).position === "fixed") return true;
    return false;
  });
  await page.evaluate(
    ({ box, label, place, color, padding, fixed }) => {
      const position = fixed ? "fixed" : "absolute";
      const left = box.x + (fixed ? 0 : window.scrollX) - padding;
      const top = box.y + (fixed ? 0 : window.scrollY) - padding;
      const frame = document.createElement("div");
      frame.dataset.shotMark = "";
      Object.assign(frame.style, {
        position,
        left: `${left}px`,
        top: `${top}px`,
        width: `${box.width + padding * 2}px`,
        height: `${box.height + padding * 2}px`,
        border: `3px solid ${color}`,
        borderRadius: "6px",
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(frame);
      if (label == null) return;
      const badge = document.createElement("div");
      badge.dataset.shotMark = "";
      badge.textContent = label;
      Object.assign(badge.style, {
        position,
        left: `${Math.max(0, place === "corner" ? left - 12 : left - 30)}px`,
        top: `${place === "corner" ? Math.max(0, top - 12) : top + (box.height + padding * 2) / 2 - 12}px`,
        minWidth: "24px",
        height: "24px",
        padding: "0 6px",
        borderRadius: "12px",
        background: color,
        color: "#fff",
        font: "700 14px/24px sans-serif",
        textAlign: "center",
        boxSizing: "border-box",
        pointerEvents: "none",
        zIndex: "2147483647",
      });
      document.body.append(badge);
    },
    { box, label: label == null ? null : String(label), place, color: COLOR, padding: PADDING, fixed },
  );
}

export async function clearMarks(page) {
  await page.evaluate(() => document.querySelectorAll("[data-shot-mark]").forEach((el) => el.remove()));
}
