# @giwa-village/core

기와장터의 **결정론 게임 로직 코어**. 온체인 컨트랙트(`contracts/GiwaGuilds.sol`·
`contracts/GiwaBoss.sol`)의 `pure` 로직을 프레임워크(React/DOM/viem 트랜잭션) 없이
재현한 순수 함수 모음이다.

> **왜 있나** — 같은 판정 공식이 컨트랙트와 클라이언트에 따로 적혀 있는 동안은
> 어긋나도 아무도 모른다. 봇·서버는 통과하는데 체인에서만 함정을 밟는 종류의
> 버그다. 판정을 한 벌로 모으면 그 드리프트가 사라지고, 부작용 없는 순수 함수라
> **제3자가 온체인 결과를 독립적으로 재현**할 수도 있게 된다.

## 담고 있는 것

| 함수 | 대응 온체인 | 용도 |
|---|---|---|
| `doorRoll(seed, guildId, attempt, step, door)` | `GiwaGuilds.doorRoll` | 던전 문 1개 판정 (safe/bonus/trap) |
| `resolveRun(seed, guildId, attempt, picks)` | `GiwaGuilds.settleRun` 재계산 루프 | 문 배열 전체 판정 — 옵티미스틱 시뮬 + 검증 |
| `safeDoorAt(seed, guildId, attempt, step)` | — | 봇/AI 주민이 비-함정 문 선택 |
| `strikeDamage(prevBlockHash, striker, ts, warmth, marketDay)` | `GiwaBoss.strike` | 보스 실제 데미지 재현 (검증기) |
| `strikeRange(warmth, marketDay)` | — | 타격 전 데미지 범위 (옵티미스틱 UI) |

`doorRoll`/`strikeDamage` 는 viem 의 `keccak256`+`encodePacked` 를 그대로 써서
온체인과 **바이트 단위로 일치**한다.

## 쓰는 법

```ts
import { resolveRun, strikeRange } from "@giwa-village/core";

// 던전: 귀환(settleRun) 전에 결과를 즉시 보여준다
const r = resolveRun(seed, 3n, attempt, picks);
if (!r.ok) showTrap(r.trapAt);
else showClimb(r.climbed);

// 보스: 타격 전 범위를 흔들어 보여주고, Struck 이벤트로 확정
const { min, max } = strikeRange(warmth, isMarketDay);
```

## 테스트

```bash
node core/test.mjs      # 체인 없이 결정론 로직 검증 (Node 24+, .ts 스트립)
```

## 상태

- **additive** — 아직 어디에도 연결돼 있지 않다. 기존 빌드에 영향 없음.
- 마이그레이션 단계(클라 `doorRollLocal` → 코어 임포트, 봇·검증기 배선)는
  `docs/core-roadmap.md` 참고.
- viem 은 `peerDependency` (sdk 와 동일 패턴 — 별도 빌드 스텝 없음).
