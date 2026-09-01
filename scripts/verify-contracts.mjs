// Blockscout 소스 검증 (standard-input, optimizer off — 배포 설정과 동일).
// Usage: node scripts/verify-contracts.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DEPLOYMENTS } from "./lib/deployments.mjs";

const require = createRequire(import.meta.url);
const solc = require("solc");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://sepolia-explorer.giwa.io/api/v2/smart-contracts";

const TARGETS = [
  { file: "GiwaMarketV3.sol", name: "GiwaMarketV3" },
  { file: "GiwaGuilds.sol", name: "GiwaGuilds" },
  { file: "GiwaPresence.sol", name: "GiwaPresence" },
  { file: "GiwaHonors.sol", name: "GiwaHonors" },
  { file: "GiwaOffers.sol", name: "GiwaOffers" },
  { file: "GiwaBoxes.sol", name: "GiwaBoxes" },
  { file: "GiwaHearth.sol", name: "GiwaHearth" },
  { file: "GiwaWorkshop.sol", name: "GiwaWorkshop" },
  { file: "GiwaBoss.sol", name: "GiwaBoss" },
  { file: "GiwaProfile.sol", name: "GiwaProfile" },
];

const ver = "v" + solc.version().replace(/\.Emscripten.*$/, "");
console.log("[verify] solc", ver);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const t of TARGETS) {
  const address = DEPLOYMENTS[t.name].address;
  const status = await fetch(`${BASE}/${address}`).then((r) => r.json());
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
  const res = await fetch(`${BASE}/${address}/verification/via/standard-input`, {
    method: "POST",
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  console.log(`[verify] ${t.name} 제출: ${res.status} ${body.message ?? ""}`);

  // 검증 완료 폴링 (최대 90초)
  let ok = false;
  for (let i = 0; i < 18; i++) {
    await sleep(5000);
    const s = await fetch(`${BASE}/${address}`).then((r) => r.json()).catch(() => null);
    if (s?.is_verified) {
      ok = true;
      break;
    }
  }
  console.log(`[verify] ${t.name} — ${ok ? "✅ 검증 완료" : "⏳ 미확정 (익스플로러에서 확인 필요)"}`);
}
