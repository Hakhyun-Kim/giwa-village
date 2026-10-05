// 시연 서버(대체 경로) — 이 PC 에서 룸 서버를 production 으로 띄우고 Cloudflare 빠른 터널로 wss 주소를 얻는다(guide/DEPLOY.md).
//   npm run demo-server            (포트를 바꾸려면 npm run demo-server -- 2600)
// production(/dev/* 닫힘) · 127.0.0.1 에만 묶는다 — 개발 모드 서버를 터널 뒤에 두지 않는다. Ctrl-C 로 둘 다 내린다.
import { spawn } from "node:child_process";

const PORT = Number(process.argv[2]) || 2567;
const LOCAL = `http://127.0.0.1:${PORT}`;
const kids = [];
const stop = (code = 0) => { for (const k of kids) k.kill(); process.exit(code); };
process.on("SIGINT", () => stop());
const alive = () => fetch(`${LOCAL}/`, { signal: AbortSignal.timeout(1000) }).then((r) => r.json()).then((j) => j.service === "giwa-village-server", () => false);

// 이미 무언가 떠 있으면(개발 서버 등) 그것을 내보내지 않는다
if (await alive()) { console.error(`${PORT} 에 이미 서버가 떠 있다 — 끄고 다시 실행한다(개발 모드 서버를 터널 뒤에 두지 않는다).`); process.exit(1); }
const server = spawn(process.execPath, ["--import", "tsx", "server/src/index.ts"], {
  env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: String(PORT) }, stdio: "inherit",
});
kids.push(server);
server.on("exit", (code) => { console.error(`룸 서버가 내려갔다 (${code})`); stop(1); });
for (let i = 0; !(await alive()); i++) { if (i > 40) { console.error("룸 서버가 뜨지 않는다"); stop(1); } await new Promise((r) => setTimeout(r, 500)); }

const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", LOCAL], { stdio: ["ignore", "ignore", "pipe"] });
kids.push(tunnel);
tunnel.on("error", () => {
  console.log(`\ncloudflared 가 없다 — 설치: winget install Cloudflare.cloudflared (새 터미널에서 다시 실행)`);
  console.log(`룸 서버는 ${LOCAL} 에서 계속 돈다(이 기기에서만 보인다). Ctrl-C 로 끈다.`);
});
let shown = false;
tunnel.stderr.on("data", (d) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d))?.[0];
  if (!url || shown) return;
  shown = true;
  const wss = url.replace(/^https/, "wss");
  console.log(`\n시연 서버: ${wss}   (상태 확인: ${url}/ → {"ok":true,...})`);
  console.log(`다음:\n  1) GitHub 저장소 Settings → Secrets and variables → Actions → Variables 에 DEMO_WS_URL = ${wss}`);
  console.log(`     (gh 가 있으면: gh variable set DEMO_WS_URL --body ${wss})`);
  console.log(`  2) Actions → "Deploy demo to GitHub Pages" → Run workflow (약 3분 뒤 공개 데모가 이 서버에 붙는다)`);
  console.log(`  끝나면 Ctrl-C — 서버와 터널이 함께 내려간다. 주소는 실행할 때마다 바뀐다.`);
});
tunnel.on("exit", (code) => { if (code !== null) { console.error(`터널이 내려갔다 (${code})`); stop(1); } });
