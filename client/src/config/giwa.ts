import { defineChain } from "viem";
import { cleanServer } from "../../../shared/crosslink";

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

/** 룸 서버(PROTOCOL.md §3.7) — 빌드가 정한다. 공개 빌드는 저장소 변수 DEMO_WS_URL(guide/DEPLOY.md), 비면 서버 없이 돈다.
 *  개발 서버는 이 기기의 서버를 본다. 공개망의 평문 ws:// · 경로 · 사용자 정보가 든 값은 "서버 없음"이다(cleanServer). */
export const WS_URL: string = cleanServer(
  import.meta.env.VITE_WS_URL || (import.meta.env.DEV ? "ws://localhost:2567" : ""),
);

export const DUNGEON_URL = "https://hakhyun-kim.github.io/dungeon100/";

/** 공개 정적 빌드(GitHub Pages) — ?slot 테스트 지갑을 끄고 시연 문구를 고른다. 룸 서버에 붙을지는 WS_URL 이 정한다 */
export const DEMO: boolean = import.meta.env.VITE_DEMO === "1";

export const FAUCET_URL = "https://faucet.giwa.io/";
