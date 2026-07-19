# 기와장터 온체인 컨트랙트 (GIWA Sepolia)

풀온체인 서버리스 아키텍처의 컨트랙트 카탈로그. 전부 Blockscout에서 소스 검증됨
(solc 0.8.36, optimizer off). 배포·검증은 저장소 루트에서:

```
node scripts/deploy-village.mjs [컨트랙트명 ...]   # 인자 없으면 전부, 있으면 해당만
node scripts/verify-contracts.mjs                  # Blockscout standard-input 검증
```

각 컨트랙트는 클라이언트의 `client/src/chain/<모듈>.ts`와 1:1로 대응하고,
`client/src/config/<모듈>.ts`(자동 생성)에 주소·ABI가 기록된다.

## 현행 컨트랙트

| 컨트랙트 | 주소 | 클라 모듈 | 역할 |
|---|---|---|---|
| **GiwaMarketV3** | `0x1f34506cda6619fc3124d68742a8fd5e7ba436e2` | `stalls` · `ledger` · `gifts` | 노점 레지스트리(openStall 단일 tx로 개설+가격기록)·에스크로 구매(confirm/24h/분쟁·환불)·ERC-1155 쿠폰(민팅·선물·redeem 소각) |
| **GiwaGuilds** | `0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638` | `guilds` | 길드 생성/가입·백층 던전(주차 blockhash 시드 핀, 문 결과 keccak, settleRun 재계산 검증·입장자 확인) |
| **GiwaPresence** | `0x4d600672cefae3c8462f3d9feb2cb739001e7a93` | `presence` | 저장 없는 위치+속도 비컨 이벤트(x,z,vx,vz,emote) — 클라 데드레커닝 |
| **GiwaHonors** | `0x7e230f68c4dabe64e6de231ea3085e50f0d5a57f` | `honors` | 소울바운드 칭호 5종 — 다른 컨트랙트의 온체인 상태로 자격 검증·클레임·장착 |
| **GiwaOffers** | `0x534a29c47667b54eab6995517705cfbc423bb909` | `offers` | 흥정(오퍼) 에스크로 — 수락 시 MarketV3를 조합해 buy→confirm→쿠폰 전달을 한 tx로 |
| **GiwaBoxes** | `0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e` | `boxes` | 랜덤박스(무료·60초 쿨다운, open→다음 블록 reveal 블록해시 확정)·소울바운드 장신구 8종 |
| **GiwaHearth** | `0xf780265d5f49abd8c7e5d18d81d33426f62f3365` | `hearth` | 모닥불 온기 — 10분 창에 2명 이상 gather하면 claim, 장날(토 21시 KST) 2배 |
| **GiwaWorkshop** | `0x664762337e529f853949a94e6ed50e6d8016c975` | `workshop` | 문양 공방(UGC) — 8x8 픽셀 문양 온체인 등록·판매(대금 창작자 직송)·착용 |

기존 Dojang(`0xd5077b…`)·UPNameRegistry(`0x091D00…`)는 외부 발행 컨트랙트로
읽기만 한다 (`client/src/config/dojang.ts` · `client/src/wallet/upid.ts`).

## 설계 원칙

- **가치는 온체인, 존재감은 비컨** — 거래·소유·기록은 컨트랙트가, 실시간 위치는
  저장 없는 이벤트로. 위치는 분쟁 가치가 없으므로 체인 상태로 두지 않는다.
- **규제 안전선** — 게임 플레이 보상은 양도 불가(소울바운드: 칭호·장신구·온기).
  거래 가능한 것은 재화(쿠폰)와 유저 창작물(문양)뿐. 랜덤박스는 참가비 0원.
- **조합(composition)** — Offers는 MarketV3를 재배포 없이 호출해 흥정 체결을
  구현한다. Honors는 Market·Guilds의 상태를 읽어 자격을 판정한다.
- **결정론 랜덤** — 던전·랜덤박스는 블록 해시로 결과를 확정한다(검증 가능).
  한계와 메인넷 대안(VRF/커밋-리빌)은 [AI Self-Audit](../client/public/audit.html) 참고.

## 과거 버전 (참고)

`GiwaMarket.sol`(v1 `0x61491f…`) · `GiwaMarketV2.sol`(`0x67cddd…`)는 노점 레지스트리
이전 버전. `GiwaMarketV3`가 현행이다.
