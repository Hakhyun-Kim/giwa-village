// 시연 가게(브랜드) 품목을 GiwaMarketV3 에 list(itemId, price) 로 올린다 — 1 wei 구매 임시 조치.
//
// 왜: MarketV3.buy() 는 리스팅이 없으면 가격을 강제하지 않는다(msg.value > 0 이면 통과).
//     브랜드 품목은 리스팅이 없어 1 wei 로 같은 tokenId 의 쿠폰을 받을 수 있었다.
//     주인 주소로 list 해 두면 buy 가 그 가격만 받는다(WrongPrice). 웹 구매는 이미 같은
//     가격으로 buy 하므로(wallet.ts buyOnMarket) 그대로 된다. 대신 그 품목의 흥정은 막힌다
//     (GiwaOffers 는 리스팅된 품목을 받지 않는다). 근본 수정은 guide/V4.md.
//     재배포 없음 — 이미 있는 list() 를 부를 뿐이다.
//
// 기본은 **읽기만 하는 예행(dry run)** 이다: 품목마다 지금의 listingOf 와 할 일을 찍는다.
// 실제로 보내려면 --yes. (가스가 든다 · GIWA Sepolia 테스트넷)
//
// 키: 품목 주인 주소(demoData.ts 의 ownerAddress)의 개인 키가 있어야 보낼 수 있다. 찾는 순서 —
//   1) 환경 변수 BRAND_OWNER_KEY (0x + 64 hex)
//   2) 저장소 루트 .testwallets.json · .botwallets.json (git 제외 · gen-wallets.mjs 형식)
// 에서 주소가 맞는 것을 고른다. 키 자체는 어디에도 찍지 않는다 — 어느 출처에서 찾았는지만 말한다.
//
// Usage: node scripts/list-brand-items.mjs          # 예행
//        node scripts/list-brand-items.mjs --yes    # 보낸다
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEPLOYMENTS } from "./lib/deployments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEND = process.argv.includes("--yes");

const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  testnet: true,
});
const MARKET = DEPLOYMENTS.GiwaMarketV3.address;
const ABI = parseAbi([
  "function list(string itemId, uint128 price) external",
  "function listingOf(address seller, string itemId) view returns (uint256 price, bool active)",
]);

// 품목 표는 옮겨 적지 않고 웹의 시연 데이터에서 읽는다(Node 의 타입 스트리핑으로 .ts 를 직접 부른다)
const { DEMO_STALLS } = await import(pathToFileURL(path.join(ROOT, "client", "src", "demo", "demoData.ts")).href);
const items = DEMO_STALLS.filter((s) => s.brand).flatMap((s) =>
  s.items.map((i) => ({ owner: s.ownerAddress, stall: s.title, id: i.id, name: i.name, price: parseEther(i.priceEth) })),
);

/** 주인 주소의 키를 찾는다. 돌려주는 것은 계정과 출처 이름뿐 — 키 문자열은 이 함수 밖으로 나가지 않는다 */
function findSigner(owner) {
  const want = owner.toLowerCase();
  const candidates = [];
  if (process.env.BRAND_OWNER_KEY) candidates.push(["환경 변수 BRAND_OWNER_KEY", process.env.BRAND_OWNER_KEY]);
  for (const file of [".testwallets.json", ".botwallets.json"]) {
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) continue;
    try {
      const list = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const w of Array.isArray(list) ? list : []) {
        if (typeof w?.privateKey === "string") candidates.push([`${file}${w.slot ? ` 슬롯 ${w.slot}` : ""}`, w.privateKey]);
      }
    } catch {
      console.warn(`  (${file} 을 읽지 못했습니다 — 건너뜀)`);
    }
  }
  for (const [source, key] of candidates) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) continue;
    const account = privateKeyToAccount(key);
    if (account.address.toLowerCase() === want) return { account, source };
  }
  return null;
}

const pub = createPublicClient({ chain: giwaSepolia, transport: http() });
const chainId = await pub.getChainId();
if (chainId !== giwaSepolia.id) throw new Error(`체인 id 가 ${chainId} 입니다 — GIWA Sepolia(91342)에서만 돕니다`);

console.log(`GiwaMarketV3 ${MARKET} · 브랜드 품목 ${items.length}개 · ${SEND ? "보낸다(--yes)" : "예행 — 보내지 않는다"}\n`);

const todo = [];
for (const it of items) {
  const [price, active] = await pub.readContract({ address: MARKET, abi: ABI, functionName: "listingOf", args: [it.owner, it.id] });
  const ok = active && price === it.price;
  const now = active ? `${formatEther(price)} ETH 로 리스팅됨` : "리스팅 없음(가격 강제 안 됨)";
  console.log(`${ok ? "✅" : "⬜"} ${it.stall} · ${it.name} (${it.id}) — 지금: ${now} → 원하는 값: ${formatEther(it.price)} ETH`);
  if (!ok) todo.push(it);
}

// process.exit 는 쓰지 않는다 — Windows 에서 .ts 를 부른 뒤 exit 하면 libuv 단언에 걸린다. 끝까지 흘러 끝낸다
if (todo.length === 0) {
  console.log("\n할 일 없음 — 모든 브랜드 품목이 이미 그 가격으로 리스팅돼 있다.");
} else {
  const owners = [...new Set(todo.map((t) => t.owner.toLowerCase()))];
  const signers = new Map();
  for (const o of owners) {
    const s = findSigner(o);
    signers.set(o, s);
    console.log(`\n주인 ${o}: ${s ? `키를 찾음 (${s.source})` : "키를 찾지 못함 — BRAND_OWNER_KEY 를 주거나 키 파일을 두세요"}`);
  }
  if (!SEND) {
    console.log(`\n예행 끝 — list 전송 ${todo.length}건이 필요하다. 보내려면: node scripts/list-brand-items.mjs --yes`);
  } else {
    for (const it of todo) {
      const s = signers.get(it.owner.toLowerCase());
      if (!s) {
        console.log(`⏭  ${it.id} — 주인 키가 없어 건너뜀`);
        continue;
      }
      const wc = createWalletClient({ account: s.account, chain: giwaSepolia, transport: http() });
      // 한 지갑에서 병렬로 보내지 않는다(nonce) — 영수증을 기다린 뒤 다음으로
      const hash = await wc.writeContract({ address: MARKET, abi: ABI, functionName: "list", args: [it.id, it.price] });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      console.log(`${receipt.status === "success" ? "✅" : "❌"} list ${it.id} ${formatEther(it.price)} ETH — ${hash}`);
    }
    console.log("\n끝 — 공개 RPC 는 리플리카가 늦을 수 있으니 조금 뒤에 예행을 다시 돌려 확인하세요.");
  }
}
