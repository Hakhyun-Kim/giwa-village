// 테스트 환경 원클릭 실행:
// 서버(:2567)와 클라이언트(:5173)가 안 떠 있으면 띄우고, 준비되면
// 듀얼 클라이언트 테스트 페이지(/test.html)를 기본 브라우저로 연다.
// Usage: node scripts/launch-test.mjs [--no-open]
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PROBE = "http://localhost:2567/";
const CLIENT_PROBE = "http://localhost:5173/";
const TEST_URL = "http://localhost:5173/test.html";
const NO_OPEN = process.argv.includes("--no-open");
const NO_BOTS = process.argv.includes("--no-bots");

const procs = [];
let shuttingDown = false;

function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function getJson(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function pipe(name, stream) {
  let buf = "";
  stream.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trimEnd();
      buf = buf.slice(i + 1);
      if (line) console.log(`[${name}] ${line}`);
    }
  });
}

function run(name, script) {
  console.log(`[launch] ${name} 시작…`);
  const p = spawn(`npm run ${script}`, {
    cwd: ROOT,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  pipe(name, p.stdout);
  pipe(name, p.stderr);
  p.on("exit", (code) => {
    if (!shuttingDown) console.log(`[launch] ${name} 종료 (code ${code})`);
  });
  procs.push(p);
}

async function waitFor(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(url)) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

function openBrowser(url) {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" });
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" });
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[launch] 종료 중…");
  for (const p of procs) {
    if (p.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      p.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 1500);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// ---- main ----
const { spawnSync } = await import("node:child_process");
spawnSync(process.execPath, ["scripts/gen-wallets.mjs", "--if-missing"], {
  cwd: ROOT,
  stdio: "inherit",
});

const serverUp = await probe(SERVER_PROBE);
const clientUp = await probe(CLIENT_PROBE);

if (serverUp) console.log("[launch] 서버가 이미 :2567에서 실행 중 — 재사용");
else run("server", "dev:server");

if (clientUp) console.log("[launch] 클라이언트가 이미 :5173에서 실행 중 — 재사용");
else run("client", "dev:client");

if (!(await waitFor(SERVER_PROBE, 30000))) {
  console.error("[launch] 서버가 30초 내에 응답하지 않습니다. 로그를 확인하세요.");
  shutdown(1);
} else if (!(await waitFor(CLIENT_PROBE, 60000))) {
  console.error("[launch] 클라이언트가 60초 내에 응답하지 않습니다. 로그를 확인하세요.");
  shutdown(1);
} else {
  // 봇 주민: 이미 마을에 있으면 재사용, 없으면 입장
  if (!NO_BOTS) {
    const status = await getJson("http://localhost:2567/dev/status");
    const hasBots = status?.players?.some((p) => p.name?.startsWith("보부상"));
    if (hasBots) console.log("[launch] 봇 주민이 이미 마을에 있음 — 재사용");
    else run("bots", "bots");
  }

  console.log(`[launch] 준비 완료 → ${TEST_URL}`);
  if (!NO_OPEN) openBrowser(TEST_URL);
  if (procs.length === 0) {
    console.log("[launch] 모든 프로세스를 재사용했으므로 런처는 종료합니다.");
    process.exit(0);
  }
  console.log("[launch] Ctrl+C 를 누르면 서버/클라이언트/봇 모두 종료됩니다.");
}
