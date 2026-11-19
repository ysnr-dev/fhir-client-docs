// 業務フローの図をクリックで拡大する。
// 本文の図は Material が幅に合わせて縮めて描く。クリックすると画面全体の重ね表示に同じ図を元の大きさで描き、
// 縦横にスクロールして読む。Escape・「×」・図の外のクリックで閉じる。
// Material は図を閉じたシャドウ DOM に描くので、元の図は取り出せない。描く前に図の元の文を控えておき、
// 拡大のときに同じ設定でもう一度描く。
(function () {
  if (typeof mermaid === "undefined") return;

  let count = 0;

  for (const pre of document.querySelectorAll("pre.mermaid")) {
    const source = pre.textContent;
    const frame = document.createElement("div");
    frame.className = "diagram-zoom";
    frame.tabIndex = 0;
    frame.setAttribute("role", "button");
    frame.setAttribute("aria-label", "図を拡大");
    frame.title = "クリックで拡大";
    pre.replaceWith(frame);
    frame.append(pre);
    frame.addEventListener("click", () => open(source));
    frame.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(source);
      }
    });
  }

  async function open(source) {
    const opener = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "diagram-zoom-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "拡大した図");
    const body = document.createElement("div");
    body.className = "diagram-zoom-overlay__body";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "diagram-zoom-overlay__close";
    close.setAttribute("aria-label", "閉じる");
    close.textContent = "×";
    overlay.append(body, close);

    const { svg } = await mermaid.render(`__diagram_zoom_${count++}`, source);
    body.innerHTML = svg;
    const drawing = body.querySelector("svg");
    const [, , width, height] = (drawing.getAttribute("viewBox") || "").split(/\s+/).map(Number);
    if (width && height) {
      drawing.setAttribute("width", width);
      drawing.setAttribute("height", height);
    }
    drawing.style.maxWidth = "none";

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.append(overlay);
    close.focus();

    function dismiss() {
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeydown);
      if (opener instanceof HTMLElement) opener.focus();
    }
    function onKeydown(event) {
      if (event.key === "Escape") dismiss();
    }
    document.addEventListener("keydown", onKeydown);
    close.addEventListener("click", dismiss);
    overlay.addEventListener("click", (event) => {
      if (!drawing.contains(event.target)) dismiss();
    });
  }
})();
