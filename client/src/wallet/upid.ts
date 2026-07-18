// UP.ID (Upbit Web3 Names) — 주소 → 이름 역방향 조회.
// UPNameRegistry(GIWA Sepolia)는 ERC-721 이름 NFT 레지스트리:
//   hasActiveName(owner) → ownedTokenId(owner) → getLabel(bytes32(tokenId))
// 이름 등록에는 Dojang 인증이 필요하다 (업비트 인증 지갑만 이름 보유).
import { useEffect, useState } from "react";
import { toHex } from "viem";
import { publicClient } from "./wallet";

export const UP_NAME_REGISTRY =
  "0x091D00004f21eb2Fc30964A8a4995692d9b49628" as const;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "hasActiveName",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "ownedTokenId",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getLabel",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const cache = new Map<string, string | null>();

/** 주소의 UP.ID 이름을 조회한다 (없으면 null) */
export async function upidNameOf(address: string): Promise<string | null> {
  const key = address.toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  let result: string | null = null;
  try {
    const has = await publicClient.readContract({
      address: UP_NAME_REGISTRY,
      abi: REGISTRY_ABI,
      functionName: "hasActiveName",
      args: [address as `0x${string}`],
    });
    if (has) {
      const tokenId = await publicClient.readContract({
        address: UP_NAME_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "ownedTokenId",
        args: [address as `0x${string}`],
      });
      const label = await publicClient.readContract({
        address: UP_NAME_REGISTRY,
        abi: REGISTRY_ABI,
        functionName: "getLabel",
        args: [toHex(tokenId, { size: 32 })],
      });
      result = label || null;
    }
  } catch {
    result = null;
  }
  cache.set(key, result);
  return result;
}

/** UP.ID 이름 React 훅 — 없으면 null (호출측에서 폴백 표시) */
export function useUpidName(address?: string | null): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setName(null);
    if (address) {
      void upidNameOf(address).then((n) => {
        if (!cancelled) setName(n);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [address]);
  return name;
}
