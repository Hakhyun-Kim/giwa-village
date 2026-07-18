// Blockscout 소스 검증 (standard-input, optimizer off — 배포 설정과 동일).
// Usage: node scripts/verify-contracts.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://sepolia-explorer.giwa.io/api/v2/smart-contracts";

const TARGETS = [
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3", address: "0xfb28e3bc250e71c0015b95ea7ab5f919b83edba7" },
  { file: "GiwaGuilds.sol", name: "GiwaGuilds", address: "0xdf0d34616a1edbe5e948b3fbb362b7d135ed9662" },
  { file: "GiwaPresence.sol", name: "GiwaPresence", address: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93" },
  { file: "GiwaHonors.sol", name: "GiwaHonors", address: "0xdc1c3388129b4e9a5ab23a8bc3b90a5c7eafc648" },
];

const ver = "v" + solc.version().replace(/\.Emscripten.*$/, "");
console.log("[verify] solc", ver);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const t of TARGETS) {
  const status = await fetch(`${BASE}/${t.address}`).then((r) => r.json());
  if (status?.is_verified) {
    console.log(`[verify] ${t.name} — 이미 검증됨`);
    continue;
  }
  const input = {
    language: "Solidity",
    sources: {
      [t.file]: { content: fs.readFileSync(path.resolve(ROOT, "contracts", t.file), "utf8") },
    },
    settings: {
      optimizer: { enabled: false, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const form = new FormData();
  form.append("compiler_version", ver);
  form.append("license_type", "mit");
  form.append("contract_name", t.name);
  form.append(
    "files[0]",
    new Blob([JSON.stringify(input)], { type: "application/json" }),
    "input.json",
  );
  const res = await fetch(`${BASE}/${t.address}/verification/via/standard-input`, {
    method: "POST",
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  console.log(`[verify] ${t.name} 제출: ${res.status} ${body.message ?? ""}`);

  // 검증 완료 폴링 (최대 90초)
  let ok = false;
  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const s = await fetch(`${BASE}/${t.address}`).then((r) => r.json()).catch(() => null);
    if (s?.is_verified) {
      ok = true;
      break;
    }
  }
  console.log(`[verify] ${t.name} — ${ok ? "✅ 검증 완료" : "⏳ 미확정 (익스플로러에서 확인 필요)"}`);
}
