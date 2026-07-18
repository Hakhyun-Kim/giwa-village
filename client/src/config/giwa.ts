import { defineChain } from "viem";

export const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia-rpc.giwa.io"] },
  },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

export const WS_URL: string =
  import.meta.env.VITE_WS_URL ?? "ws://localhost:2567";

export const DUNGEON_URL = "https://hakhyun-kim.github.io/dungeon100/";

/** 정적 배포(GitHub Pages)용 데모 모드 — 서버 없이 로컬 NPC + 실제 온체인 */
export const DEMO: boolean = import.meta.env.VITE_DEMO === "1";

export const FAUCET_URL = "https://faucet.giwa.io/";
