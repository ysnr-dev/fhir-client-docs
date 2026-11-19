// fhir-client の業務フロー(docs/order-flows/*.md)をサイトに写す。
// - 業務フロー(docs/flows/): 冒頭の概要と「運用フロー」節。開発者向けの記述が残っていたら何も書かずに止まる。
// - シーケンス図(docs/dev/): 「開発者向け」節。fhir-client の設計文書を出典として示す記述(開発者向けの案内の段落と、
//   本文の「([設計文書](../x.md) §1)」の括弧書き)は載せない。設計文書へのリンクが残っていたら止まる。
// 一覧のページと mkdocs.yml の目次も、fhir-client の docs/order-flows/readme.md の表から作り直す。
// 写すときに、図の区画から拾った部署を冒頭に、状態の表(1 列目の見出しが「状態」)の状態を色付きのラベルにする。
// 使い方: npm run sync-flows(fhir-client の場所は FHIR_CLIENT_DIR、既定は ../fhir-client)
// 直すのは fhir-client 側の文書。
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = path.resolve(ROOT, process.env.FHIR_CLIENT_DIR || "../fhir-client", "docs/order-flows");
const FLOWS_OUT = path.join(ROOT, "docs/flows");
const DEV_OUT = path.join(ROOT, "docs/dev");
const MKDOCS = path.join(ROOT, "mkdocs.yml");

const OPS_HEADING = "## 運用フロー";
const DEV_HEADING = "## 開発者向け";
const DEV_PARAGRAPH = "医療機関の運用を検討する人は";
const FLOWS_NAV = ["# sync-flows:begin", "# sync-flows:end"];
const DEV_NAV = ["# sync-dev:begin", "# sync-dev:end"];
const FLOWS_LEAD = "オーダーの種別ごとに、登録から実施・結果の確認までの流れを図で示します。";
const DEV_LEAD =
  "院内の開発者向けに、業務フローの操作ごとに画面・backend・上流の FHIR サーバーの間で何が起きるかを示します。" +
  "運用の流れは[業務フロー](../flows/index.md)を、リソースの要素は[FHIR 実装ガイド](https://ysnr-dev.github.io/fhir-ig/index.html)を読みます。";
// リンクと、その直後に「」で並べた節の名前(「[x.md](x.md)「登録の判定」」)。
const LINK = /\[([^\]]*)\]\(([^)\s]+)\)((?:「[^」]*」)*)/g;
const QUOTED = /「([^」]*)」/g;
// 本文の出典の括弧書き。「([設計文書](../x.md))」「([設計文書](../x.md) §1)」。
const CITATION = /\(\[[^\]]*\]\(\.\.\/[^)]*\)[^()]*\)/g;

// 業務フローに残っていてはいけない記述。
const FORBIDDEN = [
  [/開発者/, "開発者向けの節を指している"],
  [/\]\(\.\.\//, "docs/ のほかの文書へのリンク"],
  [/`\/[\w-]/, "画面の URL のパス"],
  [/`[A-Z][A-Z0-9]*_[A-Z0-9_]+`/, "テンプレートなどのコード"],
  [/\bseed\b|db:seed/, "seed"],
  [/(?<![\w`])[A-Z][A-Z0-9]*_[A-Z0-9_]*[A-Z0-9](?![\w`])/, "テンプレートなどのコード"],
  [/(?<![\w.\/-])[\w-]+\.md(?![\w(])/, "文書のファイル名"],
  [/バックログ/, "開発の課題の一覧(バックログ)への参照"],
  [/SS-MIX2|HL7|(?<![A-Za-z])[A-Z]{2,3}\^[A-Z]\d{2}|(?<![A-Za-z])(?:MSH|PID|PV1|ORC|OBR|OBX|SPM|TQ1|NTE|AL1|ODS|RXE|RXR)-\d+/, "連携の規格・電文・フィールドの名前"],
];
// 業務フローの検査で、業務フローの文書どうしのリンク(文字と先のファイル名)は見ない。
const FLOW_LINK = /\[[\w-]+\.md\]\([\w-]+\.md(#[^)\s]*)?\)|\]\([\w-]+\.md(#[^)\s]*)?\)/g;

// 図の大きさの上限。本文の幅に縮めても読めるように、超えたら止まる(fhir-client 側で図を分けるか、中身を表に出す)。
const DIAGRAM_LIMITS = {
  nodes: 14, // 流れ図 1 枚のノードの数
  labelLines: 2, // ノードのラベルの行の数(<br/> で数える)
  messages: 20, // シーケンス図 1 枚のメッセージの数
  participants: 5, // シーケンス図 1 枚の登場者の数
  messageWidth: 48, // メッセージの文の幅(全角 2・半角 1)
  noteLines: 3, // Note の行の数
  noteWidth: 60, // Note の 1 行の幅
};

// 状態のラベルの色。表に一覧に無い状態が出たら止まるので、ここに足す。
const STATE_TONES = {
  waiting: ["依頼済", "申込済", "予約済", "入院予定", "下書き", "処方済"],
  active: ["受付済", "対応中", "介入中", "実施中", "適用中", "進行中", "入室中", "診察中", "入院中", "計画中", "治療中", "承認済", "払出済", "出庫済"],
  hold: ["照会中・処方変更待ち", "中断", "休止", "一時終了"],
  done: ["調剤済", "実施済", "回答済", "報告済", "検査済", "終了", "完了", "診療済", "退院"],
  stop: ["中止", "取消", "却下", "廃止", "未来院", "入院予定取消", "入院取消"],
};
const STATE_TONE = new Map(Object.entries(STATE_TONES).flatMap(([tone, words]) => words.map((w) => [w, tone])));
// 長い語から当てる(「入院予定取消」を「入院予定」と取り違えない)。
const STATE_WORDS = [...STATE_TONE.keys()].sort((a, b) => b.length - a.length);

// 部署のラベルの色。図の区画の名前を上から順に当てはめ、どれにも当たらなければ部門の色にする。
const ROLE_TONES = [
  ["office", /医事|受付|患者|担当者/],
  ["dept", /^部門/],
  ["doctor", /医師|主治医|依頼医|記載医|読影医|治療医|麻酔科/],
  ["nurse", /病棟|看護|外来/],
  ["pharmacy", /薬剤/],
];
// 図の区画のうち、部署ではなく段階を表すもの。
const NOT_ROLES = new Set(["術後"]);

const readme = await readFile(path.join(SOURCE, "readme.md"), "utf8");
const entries = [...readme.matchAll(/^\| \[([\w-]+\.md)\]\(\1\) \| (.+?) \|$/gm)].map(([, file, summary]) => {
  const match = summary.match(/^(.+?)\((.+)\)$/);
  return { file, name: match ? match[1] : summary, summary: match ? match[2] : "" };
});
if (entries.length === 0) throw new Error(`${SOURCE}/readme.md に文書の表が見つかりません`);

const docs = new Map();
for (const entry of entries) {
  docs.set(entry.file, parse(entry, await readFile(path.join(SOURCE, entry.file), "utf8")));
}

const problems = [];
const flowPages = new Map();
const devPages = new Map();
for (const [file, doc] of docs) {
  flowPages.set(file, renderFlow(file, doc, problems));
  devPages.set(file, renderDev(file, doc, problems));
}
if (problems.length > 0) {
  console.error(`写せない記述があります(${problems.length} 件)。fhir-client 側の文書を直してください。`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await writePages(FLOWS_OUT, flowPages, renderIndex("業務フロー", FLOWS_LEAD, entries));
await writePages(DEV_OUT, devPages, renderIndex("シーケンス図", DEV_LEAD, entries));
let yaml = await readFile(MKDOCS, "utf8");
yaml = renderNav(yaml, FLOWS_NAV, entries.map((e) => [e.name, `flows/${e.file}`]));
yaml = renderNav(yaml, DEV_NAV, entries.map((e) => [e.name, `dev/${e.file}`]));
await writeFile(MKDOCS, yaml);
console.log(`業務フロー ${flowPages.size} 件・シーケンス図 ${devPages.size} 件を写しました`);

function parse(entry, text) {
  const { file } = entry;
  const lines = text.split("\n").map((value, i) => ({ n: i + 1, value }));
  if (!lines[0].value.startsWith("# ")) throw new Error(`${file}: 1 行目が見出しではありません`);
  const ops = lines.findIndex((l) => l.value === OPS_HEADING);
  if (ops < 0) throw new Error(`${file}: 「${OPS_HEADING}」がありません`);
  const dev = lines.findIndex((l) => l.value === DEV_HEADING);
  const intro = paragraphs(lines.slice(1, ops));
  return {
    name: entry.name,
    title: lines[0].value.slice(2).trim(),
    intro: intro.filter((p) => !p[0].value.startsWith(DEV_PARAGRAPH)),
    body: lines.slice(ops + 1, dev < 0 ? lines.length : dev),
    devBody: dev < 0 ? [] : lines.slice(dev + 1),
    opsAnchors: anchorsOf(lines.slice(ops + 1, dev < 0 ? lines.length : dev), (text) => text),
    devAnchors: anchorsOf(dev < 0 ? [] : lines.slice(dev + 1), devHeading),
  };
}

// 節の見出しのアンカー(元の文書での名前 → 写した先のページでの名前)。
function anchorsOf(lines, rename) {
  const anchors = new Map();
  let fenced = false;
  for (const { value } of lines) {
    if (value.startsWith("```")) fenced = !fenced;
    const match = !fenced && value.match(/^#{2,6} (.+)$/);
    if (match) anchors.set(slug(match[1]), slug(rename(match[1])));
  }
  return anchors;
}

// GitHub と pymdownx.slugs の見出しのアンカー。記号を落とし、空白をハイフンにする。
function slug(text) {
  return text
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

// ページの題名がシーケンス図なので、見出しの「シーケンス図: 」は外す。
function devHeading(text) {
  return text.replace(/^シーケンス図: /, "");
}

function paragraphs(lines) {
  const result = [];
  let current = [];
  for (const line of lines) {
    if (line.value.trim() === "") {
      if (current.length > 0) result.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function renderFlow(file, doc, problems) {
  const rewrite = (line) => rewriteFlowLine(file, line, problems);
  // 注記は見出しの後に置く(先頭に置くと MkDocs が見出しを題名として拾わない)。
  const out = [`# ${doc.title}`, "", `<!-- ../fhir-client/docs/order-flows/${file} から scripts/sync-flows.mjs で作る。直接編集しない。 -->`, ""];
  for (const paragraph of doc.intro) out.push(...paragraph.map(rewrite), "");
  const roles = rolesOf(doc.body);
  if (roles.length > 0) {
    const chips = roles.map((role) => `<span class="chip role-${roleTone(role)}">${role}</span>`);
    out.push(`<p class="roles" aria-label="登場する部署">${chips.join(" ")}</p>`, "");
  }
  out.push(...renderBody(file, doc.body, rewrite, problems));
  return `${out.join("\n").trimEnd()}\n`;
}

function renderDev(file, doc, problems) {
  if (doc.devBody.length === 0) throw new Error(`${file}: 「${DEV_HEADING}」がありません`);
  const rewrite = (line) => rewriteDevLine(file, line, problems);
  const out = [`# ${doc.name}のシーケンス図`, "", `<!-- ../fhir-client/docs/order-flows/${file} から scripts/sync-flows.mjs で作る。直接編集しない。 -->`, ""];
  out.push(`運用の流れは[${doc.title}](../flows/${file})にあります。`, "");
  out.push(...renderBody(file, doc.devBody, rewrite, problems).map((v) => v.replace(/^(#{2,6} )(.+)$/, (_, h, text) => h + devHeading(text))));
  return `${out.join("\n").trimEnd()}\n`;
}

// 節の中身。見出しを 1 段上げ(### → ##)、状態の表にラベルを付ける。
function renderBody(file, lines, rewrite, problems) {
  const body = trimBlank(lines);
  checkDiagrams(file, body, problems);
  const out = [];
  let fenced = false;
  let stateTable = false;
  body.forEach((line, i) => {
    if (line.value.startsWith("```")) fenced = !fenced;
    let value = rewrite(line);
    if (!fenced) {
      if (isStateTableHeader(line.value, body[i + 1]?.value)) stateTable = true;
      else if (!line.value.startsWith("|")) stateTable = false;
      else if (stateTable && !isTableSeparator(line.value)) value = stateChip(file, line, value, problems);
    }
    out.push(!fenced && /^#{3,6} /.test(value) ? value.slice(1) : value);
  });
  return out;
}

// 図ごとに大きさを確かめる。
function checkDiagrams(file, lines, problems) {
  let block = null;
  for (const line of lines) {
    if (block === null) {
      if (line.value.trim() === "```mermaid") block = [];
    } else if (line.value.trim() === "```") {
      checkDiagram(file, block, problems);
      block = null;
    } else {
      block.push(line);
    }
  }
}

function checkDiagram(file, block, problems) {
  const first = block.find((line) => line.value.trim() !== "");
  if (!first) return;
  const at = `${file}:${first.n}`;
  const limits = DIAGRAM_LIMITS;
  const linesOf = (text) => text.split(/<br\s*\/?>/);
  if (/^\s*(flowchart|graph)\b/.test(first.value)) {
    const nodes = new Set();
    for (const line of block) {
      if (/^\s*subgraph\b/.test(line.value)) continue;
      for (const [, id, label] of line.value.matchAll(/(?:^|\s)(\w+)\s*[[({]+"([^"]*)"[\])}]+/g)) {
        nodes.add(id);
        if (linesOf(label).length > limits.labelLines) {
          problems.push(`${file}:${line.n}: ノードのラベルが ${linesOf(label).length} 行(上限 ${limits.labelLines})。項目の列挙は図の下の表に出す: ${label.slice(0, 40)}`);
        }
      }
    }
    if (nodes.size > limits.nodes) problems.push(`${at}: 流れ図のノードが ${nodes.size} 個(上限 ${limits.nodes})。図を分けるか、入力チェックの並びを表にする`);
  } else if (/^\s*sequenceDiagram\b/.test(first.value)) {
    let messages = 0;
    let participants = 0;
    for (const line of block) {
      if (/^\s*(actor|participant)\s/.test(line.value)) participants += 1;
      const message = line.value.match(/^\s*\w+\s*(?:-->>|->>|--\)|-\)|-->|->|--x|-x)\s*\w+\s*:\s*(.*)$/);
      if (message) {
        messages += 1;
        if (width(message[1]) > limits.messageWidth) {
          problems.push(`${file}:${line.n}: メッセージの文の幅が ${width(message[1])}(上限 ${limits.messageWidth})。検索の条件や要素の列挙は図の下に出す: ${message[1].slice(0, 40)}`);
        }
      }
      const note = line.value.match(/^\s*Note\s+[^:]+:\s*(.*)$/);
      if (note) {
        const rows = linesOf(note[1]);
        if (rows.length > limits.noteLines) problems.push(`${file}:${line.n}: Note が ${rows.length} 行(上限 ${limits.noteLines})。書き込みの中身は図の下の表に出す`);
        else if (rows.some((row) => width(row) > limits.noteWidth)) problems.push(`${file}:${line.n}: Note の 1 行の幅が上限 ${limits.noteWidth} を超える`);
      }
    }
    if (messages > limits.messages) problems.push(`${at}: シーケンス図のメッセージが ${messages} 本(上限 ${limits.messages})。操作ごとに図を分ける`);
    if (participants > limits.participants) problems.push(`${at}: シーケンス図の登場者が ${participants}(上限 ${limits.participants})`);
  }
}

// 文の幅。全角を 2、半角を 1 と数える。
function width(text) {
  let total = 0;
  for (const char of text) total += /[\u0020-\u007e]/.test(char) ? 1 : 2;
  return total;
}

function rolesOf(lines) {
  const roles = [];
  for (const { value } of lines) {
    const match = value.match(/^\s*subgraph\s+\w+\s*\["?([^"\]]+)"?\]/);
    if (match && !NOT_ROLES.has(match[1]) && !roles.includes(match[1])) roles.push(match[1]);
  }
  return roles;
}

function roleTone(role) {
  return ROLE_TONES.find(([, pattern]) => pattern.test(role))?.[0] ?? "dept";
}

function isTableSeparator(value) {
  return /^\|[-| :]+\|$/.test(value.trim());
}

function isStateTableHeader(value, next) {
  return /^\|\s*状態\s*\|/.test(value) && next !== undefined && isTableSeparator(next);
}

// 1 列目の先頭の状態をラベルにする。後ろの補足(「(作る操作なし)」など)は残す。
function stateChip(file, line, value, problems) {
  return value.replace(/^\|\s*([^|]+?)\s*\|/, (whole, cell) => {
    const state = STATE_WORDS.find((word) => cell.startsWith(word));
    if (!state) {
      problems.push(`${file}:${line.n}: 状態の色が決まっていない(sync-flows.mjs の STATE_TONES に足す): ${cell}`);
      return whole;
    }
    const rest = cell.slice(state.length).trim();
    return `| <span class="chip state-${STATE_TONE.get(state)}">${state}</span>${rest ? ` ${rest}` : ""} |`;
  });
}

function rewriteFlowLine(file, line, problems) {
  const checked = line.value.replace(FLOW_LINK, "");
  for (const [pattern, reason] of FORBIDDEN) {
    if (pattern.test(checked)) problems.push(`${file}:${line.n}: ${reason}: ${line.value.trim().slice(0, 80)}`);
  }
  return line.value.replace(LINK, (whole, text, target, quoted) => {
    if (/^https?:/.test(target)) return whole;
    const [targetFile] = target.split("#");
    const linked = docs.get(targetFile);
    if (!linked) {
      problems.push(`${file}:${line.n}: 業務フロー以外へのリンク: ${target}`);
      return whole;
    }
    // ファイル名のままのリンクの文字は、リンク先の文書の題名にする。
    const sections = quoted.replace(QUOTED, (_, heading) => {
      const anchor = linked.opsAnchors.get(slug(heading));
      if (anchor === undefined) {
        problems.push(`${file}:${line.n}: ${targetFile} の「運用フロー」節に見出し「${heading}」が無い`);
        return `「${heading}」`;
      }
      return `「[${heading}](${targetFile}#${anchor})」`;
    });
    return `[${text.endsWith(".md") ? linked.title : text}](${target})${sections}`;
  });
}

// 出典の括弧書きを落とし、業務フローの文書どうしのリンクは、先が「開発者向け」節の見出しならシーケンス図のページへ、
// それ以外は業務フローのページへ向ける。
function rewriteDevLine(file, line, problems) {
  if (/`(docs\/)?[\w./-]+\.md`/.test(line.value)) {
    problems.push(`${file}:${line.n}: 文書の名前(出典は「([設計文書](../x.md) §1)」の括弧書きにする): ${line.value.trim().slice(0, 80)}`);
  }
  return line.value.replace(CITATION, "").replace(LINK, (whole, text, target, quoted) => {
    if (/^https?:/.test(target)) return whole;
    const [targetFile, anchor] = target.split("#");
    const linked = docs.get(targetFile);
    if (!linked) {
      problems.push(`${file}:${line.n}: 設計文書へのリンク(出典は「([設計文書](../x.md) §1)」の括弧書きにする): ${target}`);
      return whole;
    }
    const named = !text.endsWith(".md");
    if (anchor && linked.devAnchors.has(anchor)) {
      return `[${named ? text : `${linked.name}のシーケンス図`}](${targetFile}#${linked.devAnchors.get(anchor)})${quoted}`;
    }
    // 直後の「」の節が「開発者向け」節の見出しなら、リンクも節の名前もシーケンス図のページへ向ける。
    // 見出しは「シーケンス図: 」を付けても外しても指せる。
    const devAnchor = (heading) => linked.devAnchors.get(slug(heading)) ?? linked.devAnchors.get(slug(`シーケンス図: ${heading}`));
    const headings = [...quoted.matchAll(QUOTED)].map((match) => match[1]);
    const toDev = !anchor && headings.length > 0 && headings.every((heading) => devAnchor(heading) !== undefined);
    const base = toDev ? targetFile : `../flows/${targetFile}`;
    const sections = quoted.replace(QUOTED, (_, heading) => {
      const found = toDev ? devAnchor(heading) : linked.opsAnchors.get(slug(heading));
      if (found === undefined) {
        problems.push(`${file}:${line.n}: ${targetFile} に見出し「${heading}」が無い(「運用フロー」節と「開発者向け」節の見出しは 1 つのリンクに混ぜない)`);
        return `「${heading}」`;
      }
      return `「[${toDev ? devHeading(heading) : heading}](${base}#${found})」`;
    });
    const label = named ? text : toDev ? `${linked.name}のシーケンス図` : linked.title;
    return `[${label}](${base}${anchor ? `#${anchor}` : ""})${sections}`;
  });
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].value.trim() === "") start += 1;
  while (end > start && lines[end - 1].value.trim() === "") end -= 1;
  return lines.slice(start, end);
}

async function writePages(dir, pages, index) {
  await mkdir(dir, { recursive: true });
  for (const file of await readdir(dir)) {
    if (file.endsWith(".md") && file !== "index.md" && !pages.has(file)) await rm(path.join(dir, file));
  }
  for (const [file, body] of pages) await writeFile(path.join(dir, file), body);
  await writeFile(path.join(dir, "index.md"), index);
}

function renderIndex(title, lead, rows) {
  return [
    `# ${title}`,
    "",
    "<!-- scripts/sync-flows.mjs が ../fhir-client/docs/order-flows/readme.md から作る。直接編集しない。 -->",
    "",
    lead,
    "",
    "| 業務フロー | 内容 |",
    "|---|---|",
    ...rows.map((e) => `| [${e.name}](${e.file}) | ${e.summary} |`),
    "",
  ].join("\n");
}

function renderNav(yaml, [beginMark, endMark], items) {
  const lines = yaml.split("\n");
  const begin = lines.findIndex((l) => l.trim() === beginMark);
  const end = lines.findIndex((l) => l.trim() === endMark);
  if (begin < 0 || end < begin) throw new Error(`mkdocs.yml に「${beginMark}」「${endMark}」の目印がありません`);
  const indent = lines[begin].match(/^\s*/)[0];
  const nav = items.map(([name, file]) => `${indent}- ${name}: ${file}`);
  return [...lines.slice(0, begin + 1), ...nav, ...lines.slice(end)].join("\n");
}
