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
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3", address: "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2" },
  { file: "GiwaGuilds.sol", name: "GiwaGuilds", address: "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638" },
  { file: "GiwaPresence.sol", name: "GiwaPresence", address: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93" },
  { file: "GiwaHonors.sol", name: "GiwaHonors", address: "0x7e230f68c4dabe64e6de231ea3085e50f0d5a57f" },
  { file: "GiwaOffers.sol", name: "GiwaOffers", address: "0x534a29c47667b54eab6995517705cfbc423bb909" },
  { file: "GiwaBoxes.sol", name: "GiwaBoxes", address: "0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e" },
  { file: "GiwaHearth.sol", name: "GiwaHearth", address: "0xf780265d5f49abd8c7e5d18d81d33426f62f3365" },
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
