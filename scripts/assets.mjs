// 외부 에셋 받아오기 — 출처를 문서가 아니라 **실행 가능한 것**으로 남긴다.
//
//   npm run assets            없는 파일을 받아 채우고, 있는 파일은 체크섬을 대조한다
//   npm run assets -- --update  받은 그대로를 정답으로 기록한다 (에셋을 새로 넣을 때만)
//
// 규칙 하나: **바이너리는 원본 그대로 둔다.** 손질(게인·피치·필터·타일링)은 코드에서
// 한다. 파일을 건드리는 순간 "이게 정말 그 출처에서 온 것인가"를 체크섬으로 답할 수
// 없게 되고, 라이선스 대조가 사람의 기억에 의존하게 된다.
//
// 의존성을 새로 넣지 않으려고 zip은 여기서 직접 푼다(store/deflate 두 가지면 충분하다).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = path.join(ROOT, "data", "assets.json");
const LEDGER = path.join(ROOT, "ASSETS.md");
const UPDATE = process.argv.includes("--update");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── 최소 zip 리더 ──────────────────────────────────────────────────────────
/** 중앙 디렉터리를 읽어 { 이름: 버퍼 } 로 돌려준다 (store/deflate만) */
function unzip(buf) {
  const eocd = (() => {
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) return i;
    }
    throw new Error("zip 끝을 찾지 못했습니다");
  })();
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("중앙 디렉터리 손상");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // 로컬 헤더에서 실제 데이터 시작을 다시 잰다 (extra 길이가 다를 수 있다)
    const lNameLen = buf.readUInt16LE(local + 26);
    const lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + size);
    out.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ── 구글 폰트: CSS를 받아 참조된 woff2를 전부 받고, CSS를 로컬 경로로 고쳐 쓴다 ──
async function fetchGoogleFont(entry, destAbs) {
  const family = entry.googleFont.replace(/ /g, "+");
  const css = (
    await get(`https://fonts.googleapis.com/css2?family=${family}&display=swap`)
  ).toString("utf8");
  const urls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com[^)]+/g) ?? [])];
  if (!urls.length) throw new Error(`${entry.id}: CSS에서 폰트 파일을 못 찾았습니다`);
  fs.mkdirSync(destAbs, { recursive: true });
  let localCss = css;
  let got = 0;
  for (const u of urls) {
    const name = u.split("/").pop();
    const file = path.join(destAbs, name);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, await get(u));
      got++;
    }
    localCss = localCss.split(u).join(`./${name}`);
  }
  fs.writeFileSync(path.join(destAbs, "font.css"), localCss);
  return { got, total: urls.length + 1 };
}

/** 디렉터리 하나의 지문 — 파일 이름과 내용이 모두 같아야 같은 값이 나온다 */
function digestDir(dirAbs) {
  if (!fs.existsSync(dirAbs)) return null;
  const rows = fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => `${e.name}:${sha(fs.readFileSync(path.join(dirAbs, e.name)))}`)
    .sort();
  return { digest: sha(rows.join("\n")), count: rows.length, bytes: dirBytes(dirAbs) };
}

function dirBytes(dirAbs) {
  return fs
    .readdirSync(dirAbs, { withFileTypes: true })
    .filter((e) => e.isFile())
    .reduce((n, e) => n + fs.statSync(path.join(dirAbs, e.name)).size, 0);
}

// ── 본체 ──────────────────────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const zipCache = new Map();
let changed = 0;
let failed = 0;

for (const entry of manifest.entries) {
  const destAbs = path.join(ROOT, ...entry.dest.split("/"));
  fs.mkdirSync(destAbs, { recursive: true });
  process.stdout.write(`${entry.id} … `);
  try {
    if (entry.googleFont) {
      const r = await fetchGoogleFont(entry, destAbs);
      changed += r.got;
      console.log(`서브셋 ${r.total - 1}개 (새로 받은 것 ${r.got})`);
    } else {
      let got = 0;
      for (const f of entry.files) {
        const out = path.join(destAbs, f.to);
        if (fs.existsSync(out)) continue;
        let buf;
        if (entry.zip) {
          if (!zipCache.has(entry.zip)) zipCache.set(entry.zip, unzip(await get(entry.zip)));
          buf = zipCache.get(entry.zip).get(f.from);
          if (!buf) throw new Error(`zip 안에 ${f.from} 이 없습니다`);
        } else {
          buf = await get(f.from);
        }
        fs.writeFileSync(out, buf);
        got++;
      }
      changed += got;
      console.log(`파일 ${entry.files.length}개 (새로 받은 것 ${got})`);
    }
  } catch (err) {
    failed++;
    console.log(`❌ ${err.message}`);
    continue;
  }

  const d = digestDir(destAbs);
  if (!entry.digest || UPDATE) {
    entry.digest = d.digest;
    entry.bytes = d.bytes;
    entry.count = d.count;
  } else if (entry.digest !== d.digest) {
    failed++;
    console.log(
      `   ❌ 지문 불일치 — 받은 것이 원장과 다릅니다.\n` +
        `      원장 ${entry.digest.slice(0, 12)} · 실제 ${d.digest.slice(0, 12)}\n` +
        `      일부러 바꾼 것이면: npm run assets -- --update`,
    );
  }
}

// 두 엔트리가 한 폴더를 나눠 쓰면(효과음처럼) 지문이 서로를 덮어쓴다 — 폴더 단위로 다시 계산
const byDest = new Map();
for (const e of manifest.entries) {
  if (!byDest.has(e.dest)) byDest.set(e.dest, []);
  byDest.get(e.dest).push(e);
}
for (const [dest, list] of byDest) {
  if (list.length < 2) continue;
  const d = digestDir(path.join(ROOT, ...dest.split("/")));
  for (const e of list) {
    e.digest = d.digest;
    e.bytes = d.bytes;
    e.count = d.count;
  }
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

// ── 사람이 읽는 원장 ──────────────────────────────────────────────────────
const total = [...byDest.keys()].reduce((n, dest) => {
  const abs = path.join(ROOT, ...dest.split("/"));
  return n + (fs.existsSync(abs) ? dirBytes(abs) : 0);
}, 0);
const kb = (n) => `${Math.round(n / 1024).toLocaleString()}KB`;

const rows = manifest.entries
  .map(
    (e) =>
      `| \`${e.dest}\` | ${e.what} | [${e.author}](${e.source}) | ${e.license} | ${e.modified} |`,
  )
  .join("\n");

fs.writeFileSync(
  LEDGER,
  `# 반입한 에셋 — 출처와 라이선스

이 파일은 **자동 생성물**이다. 고칠 곳은 \`data/assets.json\`이고, \`npm run assets\`가
받아 오면서 다시 쓴다. \`npm test\`가 원장에 없는 바이너리를 잡는다.

**바이너리는 원본 그대로 둔다.** 손질(게인·피치·필터·타일링·색조)은 전부 코드에서
한다 — 그래야 "이게 정말 그 출처에서 온 것인가"에 체크섬으로 답할 수 있다.

허용 라이선스: ${Object.keys(manifest.licenses)
    .map((l) => `**${l}**`)
    .join(" · ")} — 그 밖의 것은 반입하지 않는다.
저작자 표기가 필요한 라이선스(CC-BY)는 아래 표와 화면 크레딧 양쪽에 이름이 있어야 한다.

용량 ${kb(total)} / 예산 ${kb(manifest.budgetBytes)}

| 자리 | 무엇 | 저작자 | 라이선스 | 우리가 한 손질 |
|---|---|---|---|---|
${rows}

## 만들지 않고 받은 이유

절차 생성이 이기는 곳(끝나지 않는 배경음·절차 지오메트리)은 그대로 두고, 합성이
약한 곳만 받았다 — 발소리·동전·문소리 같은 **한 번 나고 마는 실물 소리**, 그리고
사진이 아니면 안 되는 **표면 질감**. 배경음은 여전히 파일이 0개다.

## 다시 받기

\`\`\`bash
npm run assets
\`\`\`

없는 파일만 받고, 있는 파일은 지문을 대조한다. 지문이 어긋나면 실패한다 —
받은 것이 출처와 다르다는 뜻이므로.
`,
);

console.log(`\n원장: ASSETS.md · 용량 ${kb(total)} / ${kb(manifest.budgetBytes)}`);
if (total > manifest.budgetBytes) {
  console.log(`❌ 예산 초과`);
  process.exit(1);
}
console.log(changed ? `새로 받은 파일 ${changed}개` : "새로 받은 파일 없음");
process.exit(failed ? 1 : 0);
