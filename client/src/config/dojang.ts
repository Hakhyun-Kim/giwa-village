// Dojang (GIWA 어테스테이션 서비스, EAS 기반) — GIWA Sepolia
// https://docs.giwa.io/giwa-ecosystem/dojang/verified-address.md
export const DOJANG_SCROLL_ADDRESS =
  "0xd5077b67dcb56caC8b270C7788FC3E6ee03F17B9" as const;

/** Upbit Korea 발행자(attester) ID */
export const UPBIT_KOREA_ATTESTER_ID =
  "0xd99b42e778498aa3c9c1f6a012359130252780511687a35982e8e52735453034" as const;

export const DOJANG_SCROLL_ABI = [
  {
    type: "function",
    name: "isVerified",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "attesterId", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
