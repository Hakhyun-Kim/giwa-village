// @giwa-village/core — 결정론 게임 로직 코어
//
// 온체인 컨트랙트의 pure 로직을 프레임워크(React/DOM/viem 트랜잭션) 없이 재현한다.
// 클라이언트(옵티미스틱 시뮬)·서버·봇/MCP·검증기가 이 한 파일을 공유해 로직
// 드리프트를 없앤다. 순수 함수뿐이라 부작용이 없고 어디서나 재현·검증 가능하다.
//
// 참조 구현: contracts/GiwaGuilds.sol · contracts/GiwaBoss.sol
export {
  DOOR_PROFILES,
  doorRoll,
  legacyDoorRoll,
  resolveRun,
  resolveRunLegacy,
  safeDoorAt,
  OUTCOME_CLIMB,
  type DoorOutcome,
  type RunResult,
} from "./dungeon.ts";

export {
  strikeDamage,
  strikeRange,
  BOSS_BASE_HP,
  BOSS_COOLDOWN_SEC,
  WARMTH_CAP,
  type DamageRange,
} from "./boss.ts";
