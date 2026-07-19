import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  http,
  parseEther,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { giwaSepolia, WS_URL } from "../config/giwa";
import { useStore } from "../state/store";
import { MARKET_ADDRESS, MARKET_ABI } from "../config/market";
import {
  DOJANG_SCROLL_ADDRESS,
  DOJANG_SCROLL_ABI,
  UPBIT_KOREA_ATTESTER_ID,
} from "../config/dojang";

export const publicClient = createPublicClient({
  chain: giwaSepolia,
  // 주의: JSON-RPC 배칭을 쓰지 말 것 — GIWA 공개 RPC가 큰 배치 배열을
  // 403으로 거부해 배치에 묶인 모든 읽기가 함께 실패한다 (실측).
  // 레이트리밋 대응은 폴링 백오프(chain/village.ts)로 한다.
  transport: http(),
});

/** the wallet client currently driving the avatar (injected or burner) */
export let activeWalletClient: WalletClient | null = null;

/**
 * 같은 지갑에서 병렬 전송하면 nonce가 충돌한다 (비컨 vs 구매/입장 등 —
 * "replacement transaction underpriced"). 모든 버너 쓰기를 이 큐로 직렬화한다.
 */
let txChain: Promise<unknown> = Promise.resolve();
export function queueTx<T>(fn: () => Promise<T>): Promise<T> {
  useStore.getState().bumpPendingTx(1);
  const run = txChain
    .then(fn, fn)
    .finally(() => useStore.getState().bumpPendingTx(-1));
  txChain = run.catch(() => {});
  return run;
}

declare global {
  interface Window {
    ethereum?: unknown;
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function colorFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return hslToHex(hue, 0.65, 0.55);
}

function hslToHex(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

export async function connectWallet(): Promise<`0x${string}`> {
  if (!window.ethereum) {
    throw new Error("브라우저에서 지갑을 찾을 수 없습니다. MetaMask 등을 설치해 주세요.");
  }
  const transport = custom(window.ethereum as Parameters<typeof custom>[0]);
  const probe = createWalletClient({ chain: giwaSepolia, transport });
  const [address] = await probe.requestAddresses();
  if (!address) throw new Error("지갑 계정을 가져오지 못했습니다.");

  try {
    await probe.switchChain({ id: giwaSepolia.id });
  } catch {
    // chain not registered in the wallet yet — add it (MetaMask switches after adding)
    await probe.addChain({ chain: giwaSepolia });
  }
  // bind the account so sendTransaction has a signer
  activeWalletClient = createWalletClient({
    account: address,
    chain: giwaSepolia,
    transport,
  });
  return address;
}

/**
 * 데모(서버리스) 모드: 방문자 자신의 지갑(MetaMask 등)에서 버너로 테스트넷
 * ETH를 충전한다. 비컨(2초)마다 서명 팝업을 띄울 수 없으므로 인젝티드 지갑은
 * 서명자로 쓰지 않고 — 충전 1회만 팝업 — 이후엔 버너가 조용히 서명한다.
 * activeWalletClient(버너)는 건드리지 않는다.
 */
export async function fundBurnerFromInjected(amountEth: string): Promise<`0x${string}`> {
  const burner = activeWalletClient?.account?.address;
  if (!burner) throw new Error("버너 지갑이 없습니다.");
  if (!window.ethereum) {
    throw new Error("브라우저에서 지갑을 찾을 수 없습니다. MetaMask 등을 설치해 주세요.");
  }
  const transport = custom(window.ethereum as Parameters<typeof custom>[0]);
  const probe = createWalletClient({ chain: giwaSepolia, transport });
  const [address] = await probe.requestAddresses();
  if (!address) throw new Error("지갑 계정을 가져오지 못했습니다.");
  try {
    await probe.switchChain({ id: giwaSepolia.id });
  } catch {
    await probe.addChain({ chain: giwaSepolia });
  }
  const injected = createWalletClient({ account: address, chain: giwaSepolia, transport });
  const tx = await injected.sendTransaction({
    account: address,
    chain: giwaSepolia,
    to: burner,
    value: parseEther(amountEth),
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** 데모 모드: 브라우저에 저장된 로컬 키로 지갑 클라이언트를 구성 */
export function adoptLocalBurner(privateKey: `0x${string}`): `0x${string}` {
  const account = privateKeyToAccount(privateKey);
  activeWalletClient = createWalletClient({
    account,
    chain: giwaSepolia,
    transport: http(),
  });
  return account.address;
}

interface TestWallet {
  slot: string;
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * Load a throwaway test wallet for the given slot (A–D) from the dev server.
 * Keys live in .testwallets.json (git-ignored); dev/testnet use only.
 */
export async function loadBurner(slot: string): Promise<`0x${string}`> {
  const base = WS_URL.replace(/^ws/, "http");
  const res = await fetch(`${base}/dev/wallets`);
  if (!res.ok) {
    throw new Error("테스트 지갑 파일이 없습니다. `npm run wallets`를 실행하세요.");
  }
  const wallets: TestWallet[] = await res.json();
  const w = wallets.find((x) => x.slot === slot);
  if (!w) throw new Error(`슬롯 ${slot}의 테스트 지갑이 없습니다.`);
  const account = privateKeyToAccount(w.privateKey);
  activeWalletClient = createWalletClient({
    account,
    chain: giwaSepolia,
    transport: http(),
  });
  return account.address;
}

export async function getBalanceEth(address: string): Promise<string> {
  const wei = await publicClient.getBalance({
    address: address as `0x${string}`,
  });
  return Number(formatEther(wei)).toFixed(4);
}

export interface GiftResult {
  tx: `0x${string}`;
  amountEth: string;
  /** v2 에스크로 구매 id (confirm에 사용) */
  purchaseId?: number;
  /** ERC-1155 쿠폰 토큰 id */
  tokenId?: string;
}

/**
 * Send an ETH gift on GIWA Sepolia from the active wallet to `to`.
 * Waits for the tx to be mined before resolving.
 */
export async function sendGiftTx(
  to: string,
  amountEth: string,
): Promise<GiftResult> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) throw new Error("받는 주소가 올바르지 않습니다.");

  const value = parseEther(amountEth);
  if (value <= 0n) throw new Error("금액은 0보다 커야 합니다.");

  const balance = await publicClient.getBalance({ address: wc.account.address });
  if (balance < value) throw new Error("잔액이 부족합니다.");

  const tx = await queueTx(() =>
    wc.sendTransaction({
      account: wc.account!,
      chain: giwaSepolia,
      to: to as `0x${string}`,
      value,
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return { tx, amountEth };
}

/**
 * Buy a stall item through the GiwaMarket contract: payment is forwarded to
 * the seller and a Purchased event becomes the on-chain receipt. If the item
 * is listed on-chain, the contract enforces the exact price.
 */
export async function buyOnMarket(
  seller: string,
  itemId: string,
  priceEth: string,
): Promise<GiftResult> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  if (!/^0x[0-9a-fA-F]{40}$/.test(seller)) throw new Error("판매자 주소가 올바르지 않습니다.");
  const value = parseEther(priceEth);
  if (value <= 0n) throw new Error("금액이 올바르지 않습니다.");
  const balance = await publicClient.getBalance({ address: wc.account.address });
  if (balance < value) throw new Error("잔액이 부족합니다.");

  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: giwaSepolia,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "buy",
      args: [seller as `0x${string}`, itemId],
      value,
    }),
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });

  // Purchased 이벤트에서 에스크로 구매 id + 쿠폰 토큰 id를 회수
  let purchaseId: number | undefined;
  let tokenId: string | undefined;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== MARKET_ADDRESS.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: MARKET_ABI, data: log.data, topics: log.topics });
      if (ev.eventName === "Purchased") {
        const args = ev.args as { purchaseId: bigint; tokenId: bigint };
        purchaseId = Number(args.purchaseId);
        tokenId = args.tokenId.toString();
      }
    } catch {
      // 다른 이벤트(TransferSingle 등)는 무시
    }
  }
  return { tx, amountEth: priceEth, purchaseId, tokenId };
}

/** 에스크로 정산 확정 — 구매자가 확인하면 판매자에게 대금이 전달된다 */
export async function confirmPurchase(purchaseId: number): Promise<`0x${string}`> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: giwaSepolia,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "confirm",
      args: [BigInt(purchaseId)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** 분쟁 신고 — 자동 정산이 7일로 연장되고, 판매자는 refund로 환불할 수 있다 */
export async function disputePurchase(purchaseId: number): Promise<`0x${string}`> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: giwaSepolia,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "dispute",
      args: [BigInt(purchaseId)],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** 쿠폰 사용 — ERC-1155 쿠폰 1장을 소각하고 온체인 사용 증빙을 남긴다 */
export async function redeemCoupon(tokenId: string): Promise<`0x${string}`> {
  const wc = activeWalletClient;
  if (!wc?.account) throw new Error("지갑이 연결되어 있지 않습니다.");
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: giwaSepolia,
      address: MARKET_ADDRESS,
      abi: MARKET_ABI,
      functionName: "redeem",
      args: [BigInt(tokenId), 1n],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  return tx;
}

/** ERC-1155 쿠폰 토큰 보유 수량 조회 */
export async function couponOwned(owner: string, tokenId: string): Promise<bigint> {
  return publicClient.readContract({
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "balanceOf",
    args: [owner as `0x${string}`, BigInt(tokenId)],
  });
}

/** best-effort on-chain listing so the contract can enforce the price */
export async function listOnMarket(itemId: string, priceEth: string): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) return;
  const tx = await wc.writeContract({
    account: wc.account,
    chain: giwaSepolia,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "list",
    args: [itemId, parseEther(priceEth)],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

const dojangCache = new Map<string, boolean>();

/**
 * Dojang Verified Address 조회: 업비트 코리아가 이 주소에 신원 인증
 * 어테스테이션을 발행했는지 온체인에서 확인한다.
 */
export async function isDojangVerified(address: string): Promise<boolean> {
  const key = address.toLowerCase();
  const cached = dojangCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const verified = await publicClient.readContract({
      address: DOJANG_SCROLL_ADDRESS,
      abi: DOJANG_SCROLL_ABI,
      functionName: "isVerified",
      args: [address as `0x${string}`, UPBIT_KOREA_ATTESTER_ID],
    });
    dojangCache.set(key, verified);
    return verified;
  } catch (err) {
    console.warn("[dojang] isVerified 조회 실패:", err);
    return false;
  }
}

/** best-effort on-chain unlisting when a stall closes */
export async function unlistOnMarket(itemId: string): Promise<void> {
  const wc = activeWalletClient;
  if (!wc?.account) return;
  const tx = await wc.writeContract({
    account: wc.account,
    chain: giwaSepolia,
    address: MARKET_ADDRESS,
    abi: MARKET_ABI,
    functionName: "unlist",
    args: [itemId],
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
}
