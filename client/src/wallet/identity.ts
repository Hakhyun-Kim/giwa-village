// 호패(GiwaIdentity) — 이 버너 뒤에 서 있는 사람이 누구인가.
//
// 마을의 쓰기는 버너가 하지만 UP.ID 이름과 Dojang 인증은 업비트가 확인한 *진짜 지갑*에
// 붙는다. 호패는 진짜 지갑이 "이 버너가 나를 대신한다"고 서명한 기록이고, 화면은 언제나
// 호패를 먼저 따라간 주소(holder)의 UP.ID · Dojang 을 보여준다. 호패가 없으면 그 주소 자신.
// 컨트랙트가 아직 배포 전이면(IDENTITY_ADDRESS = null) 호패 없이 예전처럼 돈다.
import { useEffect, useState } from "react";
import { createWalletClient, custom } from "viem";
import { giwaSepolia } from "../config/giwa";
import { IDENTITY_ADDRESS, IDENTITY_ABI } from "../config/identity";
import { activeWalletClient, isDojangVerified, publicClient, queueTx } from "./wallet";
import { upidNameOf } from "./upid";

export interface Identity {
  /** 이름 · 인증을 읽은 주소 — 호패가 있으면 진짜 지갑, 없으면 그 주소 자신 */
  holder: string;
  /** 호패가 걸려 있는가 */
  linked: boolean;
  /** UP.ID 이름 (없으면 null) */
  name: string | null;
  /** 업비트 Dojang 인증 */
  dojang: boolean;
}

export const hopaeAvailable = IDENTITY_ADDRESS !== null;

const principalCache = new Map<string, Promise<string | null>>();

async function principalOf(address: string): Promise<string | null> {
  if (!IDENTITY_ADDRESS) return null;
  const key = address.toLowerCase();
  let hit = principalCache.get(key);
  if (!hit) {
    hit = publicClient
      .readContract({
        address: IDENTITY_ADDRESS,
        abi: IDENTITY_ABI,
        functionName: "principalOf",
        args: [address as `0x${string}`],
      })
      .then((p) => (/^0x0{40}$/i.test(p) ? null : p))
      .catch(() => {
        principalCache.delete(key); // 레이트리밋이면 다음에 다시 묻는다
        return null;
      });
    principalCache.set(key, hit);
  }
  return hit;
}

export async function identityOf(address: string): Promise<Identity> {
  // 시연 주민의 노점처럼 지갑이 아닌 것은 체인에 묻지 않는다
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return { holder: address, linked: false, name: null, dojang: false };
  const principal = await principalOf(address);
  const holder = principal ?? address;
  const [name, dojang] = await Promise.all([upidNameOf(holder), isDojangVerified(holder)]);
  return { holder, linked: !!principal, name, dojang };
}

/** 이름표에 ✓ 를 붙여도 되는가 — 업비트가 확인한 사람일 때만 */
export const isVerifiedIdentity = (id: Identity | null) => !!id && (id.dojang || !!id.name);

/** 호패를 고려한 신원 훅 — 조회 전에는 null */
export function useIdentity(address?: string | null): Identity | null {
  const [id, setId] = useState<Identity | null>(null);
  useEffect(() => {
    let cancelled = false;
    setId(null);
    if (address) {
      const run = () =>
        void identityOf(address).then((v) => {
          if (!cancelled) setId(v);
        });
      run();
      // 내 호패를 방금 걸었거나 내려놓았으면 다시 읽는다
      const onChange = (e: Event) => {
        if ((e as CustomEvent<string>).detail === address.toLowerCase()) run();
      };
      window.addEventListener("giwa-hopae", onChange);
      return () => {
        cancelled = true;
        window.removeEventListener("giwa-hopae", onChange);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [address]);
  return id;
}

function announce(burner: string) {
  const key = burner.toLowerCase();
  principalCache.delete(key);
  window.dispatchEvent(new CustomEvent("giwa-hopae", { detail: key }));
}

const LINK_TYPES = {
  Link: [
    { name: "burner", type: "address" },
    { name: "principal", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * 호패를 건다: 내 진짜 지갑(MetaMask 등)이 서명 한 번(가스 없음)으로 이 버너를 대리로 세우고,
 * 버너가 그 서명을 체인에 올린다(버너의 노잣돈이 든다). 진짜 지갑의 키는 여기 들어오지 않는다.
 */
export async function linkHopaeFromInjected(): Promise<Identity> {
  if (!IDENTITY_ADDRESS) throw new Error("호패가 아직 이 마을에 배포되지 않았습니다.");
  const wc = activeWalletClient;
  const burner = wc?.account?.address;
  if (!wc?.account || !burner) throw new Error("버너 지갑이 없습니다.");
  if (!window.ethereum) {
    throw new Error("브라우저에서 지갑을 찾을 수 없습니다. UP.ID 를 가진 지갑(MetaMask 등)이 필요합니다.");
  }
  const transport = custom(window.ethereum as Parameters<typeof custom>[0]);
  const probe = createWalletClient({ chain: giwaSepolia, transport });
  const [principal] = await probe.requestAddresses();
  if (!principal) throw new Error("지갑 계정을 가져오지 못했습니다.");
  if (principal.toLowerCase() === burner.toLowerCase()) {
    throw new Error("버너 자신에게는 호패를 걸 수 없습니다.");
  }

  // 업비트가 확인하지 않은 지갑을 걸면 이름표에 아무것도 더해지지 않는다 — 쓰기를 아낀다
  const [name, dojang] = await Promise.all([upidNameOf(principal), isDojangVerified(principal)]);
  if (!name && !dojang) {
    throw new Error("이 지갑에는 UP.ID 도 Dojang 인증도 없습니다. 업비트에서 인증한 지갑으로 다시 시도해 주세요.");
  }
  if ((await publicClient.getBalance({ address: burner })) === 0n) {
    throw new Error("버너에 노잣돈이 없습니다. 먼저 '내 지갑에서 충전'을 눌러 주세요.");
  }

  try {
    await probe.switchChain({ id: giwaSepolia.id });
  } catch {
    await probe.addChain({ chain: giwaSepolia });
  }
  const nonce = await publicClient.readContract({
    address: IDENTITY_ADDRESS,
    abi: IDENTITY_ABI,
    functionName: "nonces",
    args: [principal],
  });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await probe.signTypedData({
    account: principal,
    domain: { name: "GiwaIdentity", version: "1", chainId: giwaSepolia.id, verifyingContract: IDENTITY_ADDRESS },
    types: LINK_TYPES,
    primaryType: "Link",
    message: { burner, principal, nonce, deadline },
  });
  const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) v += 27;

  const address = IDENTITY_ADDRESS;
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address,
      abi: IDENTITY_ABI,
      functionName: "link",
      args: [principal, deadline, v, r, s],
    }),
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error("호패를 걸지 못했습니다.");
  announce(burner);
  return { holder: principal, linked: true, name, dojang };
}

/** 이 버너의 호패를 내려놓는다 */
export async function unlinkHopae(): Promise<void> {
  if (!IDENTITY_ADDRESS) return;
  const wc = activeWalletClient;
  const burner = wc?.account?.address;
  if (!wc?.account || !burner) throw new Error("버너 지갑이 없습니다.");
  const address = IDENTITY_ADDRESS;
  const tx = await queueTx(() =>
    wc.writeContract({
      account: wc.account!,
      chain: wc.chain,
      address,
      abi: IDENTITY_ABI,
      functionName: "unlink",
      args: [],
    }),
  );
  await publicClient.waitForTransactionReceipt({ hash: tx });
  announce(burner);
}
