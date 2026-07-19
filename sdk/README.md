# @giwa-village/sdk

기와장터(GIWA Village)의 **온체인 소셜 데이터 읽기 SDK**. 마을의 모든 상태(길드·칭호·
장신구·문양·온기·전리품·노점·프레즌스)는 GIWA Sepolia 공개 컨트랙트에 살아 있으므로,
서버·API 키 없이 RPC만으로 어떤 앱에서든 읽을 수 있다 — 디스코드 봇, 외부 dApp,
지갑 앱의 프로필 위젯까지.

```ts
import { createVillageClient } from "@giwa-village/sdk";

const village = createVillageClient(); // 커스텀 RPC: createVillageClient("https://...")

// 지갑의 마을 프로필 — RPC 1콜 (GiwaProfile 애그리게이터)
const p = await village.getProfile("0x7a07...");
// { guildName: "온체인 원정대", equippedHonor: "등반왕", equippedTrinket: "풍경",
//   honors: [...], warmth: 3, trophies: 1, wear: { pixels, palette } | null }

// 길드 리더보드 (이번 주 등반 순위)
const board = await village.getLeaderboard();

// 열려 있는 노점 전체
const stalls = await village.getStalls();

// 마을 프레즌스 실시간 구독
const stop = village.watchPresence((b) => console.log(b.who, b.x, b.z));
```

## 활용 예

- **디스코드/텔레그램 봇** — 주간 길드 등반 순위·도깨비 토벌 현황 자동 공지
- **외부 dApp 뱃지** — "이 지갑은 기와장터 등반왕" 같은 온체인 평판 표시
- **프로필 위젯** — 지갑 앱이 `getProfile` 1콜로 소셜 프로필 렌더 (문양 픽셀 원본 포함)

## 설계

- 읽기 전용 · 무신뢰: 모든 데이터는 [Verified 컨트랙트](../contracts/README.md)의 view/이벤트
- `getProfile`은 [GiwaProfile](https://sepolia-explorer.giwa.io/address/0xefe0e8d69661fd67f5fe2368f9b1f7ff6d395416)
  애그리게이터로 6개 컨트랙트를 1콜에 집계
- 참조 구현: 게임 클라이언트 `client/src/chain/*` (같은 컨트랙트를 소비)
- 소스 배포(TS) — 번들러 환경에서 바로 사용. `viem` peer dependency
