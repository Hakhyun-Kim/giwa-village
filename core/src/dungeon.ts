// 백층 던전 — 결정론 문 판정 (GiwaGuilds.doorRoll / settleRun 의 순수 재현)
//
// 온체인 컨트랙트(contracts/GiwaGuilds.sol)의 `doorRoll` 은 pure 함수다:
//   b = keccak256(abi.encodePacked(seed, guildId, attempt, step, door))[0]
//   문별 경계는 DOOR_PROFILES에 있다. 돌문은 안정, 바람문은 균형,
//   도깨비문은 고위험·고보너스라서 문을 고르는 것 자체가 결정이 된다.
// 이 파일은 그 로직을 프레임워크 없이 재현해, 아래 넷이 "같은 코드"를 쓰게 한다:
//   - 클라이언트: 즉시 시뮬레이션(옵티미스틱) — 귀환 전에 결과를 보여준다
//   - 봇/MCP: 무엇을 고를지 판정
//   - 검증기: RunSettled 이벤트를 제3자가 독립 재현·검증 ("검증 가능한 공정성")
// viem 의 keccak256/encodePacked 를 그대로 써서 온체인과 바이트 단위로 일치한다.
import { encodePacked, hexToBytes, keccak256 } from "viem";

export type DoorOutcome = "safe" | "bonus" | "trap";

// DOOR_TABLE: 218/218,141/192,64/154
export const DOOR_PROFILES = [
  { id: 0, emoji: "🪨", name: "돌문", style: "안정", safeLt: 218, bonusLt: 218 },
  { id: 1, emoji: "🌬️", name: "바람문", style: "균형", safeLt: 141, bonusLt: 192 },
  { id: 2, emoji: "👹", name: "도깨비문", style: "승부", safeLt: 64, bonusLt: 154 },
] as const;

/** 문 결과가 올려주는 층수 (함정은 원정 실패라 0) */
export const OUTCOME_CLIMB: Record<DoorOutcome, number> = {
  safe: 1,
  bonus: 2,
  trap: 0,
};

/**
 * 문 하나의 결과 — 온체인 GiwaGuilds.doorRoll 과 바이트 단위로 동일.
 * @param seed    주차 시드 (bytes32, epochSeed[e] = 직전 블록해시)
 * @param guildId 길드 id (uint256)
 * @param attempt 원정 회차 (uint32)
 * @param step    원정 내 스텝 번호 (0부터, uint256)
 * @param door    선택한 문 (0~2, uint8)
 */
export function doorRoll(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
  door: number,
): DoorOutcome {
  const digest = keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint32", "uint256", "uint8"],
      [seed, guildId, attempt, BigInt(step), door],
    ),
  );
  const b = hexToBytes(digest)[0];
  const profile = DOOR_PROFILES[door] ?? DOOR_PROFILES[2];
  if (b < profile.safeLt) return "safe";
  if (b < profile.bonusLt) return "bonus";
  return "trap";
}

/** 이미 배포된 GiwaGuilds v1 호환 판정. v2 주소 전환 전 라이브 원정만 이 표를 쓴다. */
export function legacyDoorRoll(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
  door: number,
): DoorOutcome {
  const digest = keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint32", "uint256", "uint8"],
      [seed, guildId, attempt, BigInt(step), door],
    ),
  );
  const b = hexToBytes(digest)[0];
  if (b < 154) return "safe";
  if (b < 192) return "bonus";
  return "trap";
}

export interface RunResult {
  /** 함정 없이 완주했는가 — settleRun 이 통과시키는 조건 그대로 */
  ok: boolean;
  /** 오른 층수 (safe +1 / bonus +2, 함정 전까지 누적) */
  climbed: number;
  /** 함정을 밟은 스텝 (없으면 null) */
  trapAt: number | null;
  /** 각 스텝의 결과 (UI 애니메이션·리플레이용) */
  steps: DoorOutcome[];
}

/**
 * 문 선택 배열 전체를 판정 — 온체인 settleRun 의 재계산 루프와 동일한 결과.
 * 클라이언트는 이걸로 옵티미스틱하게 결과를 먼저 그리고, settleRun 확정 뒤 대조한다.
 */
export function resolveRun(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  picks: number[],
): RunResult {
  const steps: DoorOutcome[] = [];
  let climbed = 0;
  for (let i = 0; i < picks.length; i++) {
    const o = doorRoll(seed, guildId, attempt, i, picks[i]);
    steps.push(o);
    if (o === "trap") return { ok: false, climbed, trapAt: i, steps };
    climbed += OUTCOME_CLIMB[o];
  }
  return { ok: true, climbed, trapAt: null, steps };
}

export function resolveRunLegacy(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  picks: number[],
): RunResult {
  const steps: DoorOutcome[] = [];
  let climbed = 0;
  for (let i = 0; i < picks.length; i++) {
    const outcome = legacyDoorRoll(seed, guildId, attempt, i, picks[i]);
    steps.push(outcome);
    if (outcome === "trap") return { ok: false, climbed, trapAt: i, steps };
    climbed += OUTCOME_CLIMB[outcome];
  }
  return { ok: true, climbed, trapAt: null, steps };
}

/**
 * 이 스텝에서 함정이 아닌 문을 찾아 반환 (없으면 null).
 * 봇/AI 주민이 다음 문을 고를 때 쓴다.
 *
 * ⚠ 알려진 한계(테스트넷): 결과가 시드로부터 결정론적이라 오프라인 탐색으로
 * 무함정 경로를 찾을 수 있다 — 컨트랙트 주석과 동일한 한계다. 메인넷에서는
 * VRF 또는 커밋-리빌로 정산 시점 엔트로피를 넣어야 한다. (docs/core-roadmap.md 참고)
 */
export function safeDoorAt(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
): number | null {
  for (let door = 0; door < 3; door++) {
    if (doorRoll(seed, guildId, attempt, step, door) !== "trap") return door;
  }
  return null;
}
