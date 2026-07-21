// 명령 실행 결과를 터미널 모양 SVG로 렌더한다 — 문서에 붙일 증거용.
//
// 왜 스크린샷이 아니라 SVG인가: 텍스트라서 diff가 되고, 어떤 해상도에서도
// 깨지지 않으며, 저장소에 바이너리를 늘리지 않는다. GitHub README와 웹 문서
// 양쪽에서 <img>로 그대로 렌더된다.
//
// Usage:
//   node scripts/render-run.mjs <출력경로.svg> <제목> -- <명령> [인자...]
// 예:
//   node scripts/render-run.mjs media/test-local.svg "npm run test:local" -- npm run test:local
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep < 0 || sep < 2) {
  console.error("Usage: node scripts/render-run.mjs <out.svg> <제목> -- <명령...>");
  process.exit(1);
}
const [outPath, title] = argv;
const cmd = argv.slice(sep + 1);

// ── 실행 ───────────────────────────────────────────────────────────────────

console.log(`[render] 실행: ${cmd.join(" ")}`);
const run = spawnSync(cmd[0], cmd.slice(1), {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
});
const raw = `${run.stdout ?? ""}${run.stderr ?? ""}`;
// eslint-disable-next-line no-control-regex
const lines = raw.replace(/\[[0-9;]*m/g, "").split(/\r?\n/);

// npm 자체 출력(> script, > node ...)은 잡음이라 걷어낸다
const cleaned = lines
  .filter((l) => !/^\s*>\s/.test(l))
  .join("\n")
  .replace(/^\n+/, "")
  .replace(/\n+$/, "")
  .split("\n");

// ── 렌더 ───────────────────────────────────────────────────────────────────

const PAD_X = 22;
const PAD_TOP = 52; // 타이틀바
const PAD_BOTTOM = 18;
const LINE_H = 21;
const CHAR_W = 8.15; // 13.5px monospace 기준 근사
const FONT = 13.5;

const longest = cleaned.reduce((m, l) => Math.max(m, [...l].reduce(
  // 한글은 폭이 대략 2배
  (w, ch) => w + (/[ㄱ-힝가-힣]/.test(ch) ? 1.85 : 1), 0,
)), 0);
const W = Math.max(560, Math.min(1180, Math.ceil(longest * CHAR_W) + PAD_X * 2));
const H = PAD_TOP + cleaned.length * LINE_H + PAD_BOTTOM;

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 줄 하나를 색을 나눠 그린다 */
function renderLine(line, y) {
  const t = (x, fill, weight, text) =>
    `<text x="${x.toFixed(1)}" y="${y}" fill="${fill}"${weight ? ` font-weight="${weight}"` : ""}>${esc(text)}</text>`;

  // 통과/실패 항목: "  ✅ 라벨 — 상세"
  const mark = line.match(/^(\s*)(✅|❌|⏭)\s(.*)$/u);
  if (mark) {
    const [, indent, sym, rest] = mark;
    const x0 = PAD_X + indent.length * CHAR_W;
    const color = sym === "✅" ? "#3FAE73" : sym === "❌" ? "#DD6B5A" : "#B4A99A";
    const dash = rest.indexOf(" — ");
    const out = [t(x0, color, 700, sym)];
    const bodyX = x0 + CHAR_W * 2.6;
    if (dash > 0) {
      out.push(t(bodyX, "#EDE7DA", null, rest.slice(0, dash)));
      const dx = bodyX + [...rest.slice(0, dash)].reduce(
        (w, ch) => w + (/[ㄱ-힝가-힣]/.test(ch) ? 1.85 : 1), 0,
      ) * CHAR_W;
      out.push(t(dx, "#8E8478", null, rest.slice(dash)));
    } else {
      out.push(t(bodyX, "#EDE7DA", null, rest));
    }
    return out.join("");
  }

  // 구분선
  if (/^─+$/.test(line.trim())) return t(PAD_X, "#392F44", null, line);

  // 마지막 요약 (전부 통과 / 실패)
  if (/^전부 통과/.test(line)) return t(PAD_X, "#3FAE73", 700, line);
  if (/^실패 \d+건/.test(line)) return t(PAD_X, "#DD6B5A", 700, line);

  // 섹션 제목 (들여쓰기 없는 비어있지 않은 줄)
  if (line && !line.startsWith(" ")) return t(PAD_X, "#C79A3F", 600, line);

  return t(PAD_X, "#B4A99A", null, line);
}

const body = cleaned
  .map((l, i) => renderLine(l, PAD_TOP + i * LINE_H))
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)} 실행 결과">
  <rect width="${W}" height="${H}" rx="12" fill="#17141D"/>
  <rect width="${W}" height="34" rx="12" fill="#241F2E"/>
  <rect y="22" width="${W}" height="12" fill="#241F2E"/>
  <circle cx="20" cy="17" r="5" fill="#DD6B5A"/>
  <circle cx="38" cy="17" r="5" fill="#D99245"/>
  <circle cx="56" cy="17" r="5" fill="#3FAE73"/>
  <g font-family="D2Coding, 'JetBrains Mono', Consolas, 'SFMono-Regular', 'Noto Sans KR', monospace" font-size="12">
    <text x="76" y="21" fill="#8E8478">${esc(title)}</text>
  </g>
  <g font-family="D2Coding, 'JetBrains Mono', Consolas, 'SFMono-Regular', 'Noto Sans KR', monospace" font-size="${FONT}" xml:space="preserve">
  ${body}
  </g>
</svg>
`;

const abs = path.resolve(ROOT, outPath);
fs.mkdirSync(path.dirname(abs), { recursive: true });
fs.writeFileSync(abs, svg, "utf8");
console.log(`[render] ${outPath} — ${cleaned.length}줄 · ${W}×${H} · ${(svg.length / 1024).toFixed(1)}KB`);
if (run.status !== 0) console.log(`[render] 주의: 명령이 종료코드 ${run.status}로 끝났습니다`);
