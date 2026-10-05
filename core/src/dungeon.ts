// 백층 던전 — 결정론 문 판정 (GiwaGuilds.doorRoll / settleRun 의 순수 재현)
//
// 온체인 컨트랙트(contracts/GiwaGuilds.sol)의 `doorRoll` 은 pure 함수다:
//   b = keccak256(abi.encodePacked(seed, guildId, attempt, step, door))[0]
//   문별 경계는 DOOR_PROFILES에 있다. 돌문은 안정, 바람문은 균형, 도깨비문은 고위험·고보너스로 설계했다.
//   기척(omenAt · guide/V4.md §10.2): 표만으로는 웹 화면의 규칙(함정이면 그 원정의 걸음을 버린다)에서 기대값으로 돌문이
//   0~5층 늘 최선이고 6층부터는 귀환이 낫다 — 문 고르기가 결정이 되지 못했다. 그래서 걸음마다 문 하나의 기척을 미리 들려준다
//   (열에 여덟은 맞는다). 기척을 따르면 최선의 수가 세 문에 퍼진다(npm test 가 DP 로 잰다). 표 · doorRoll · 체인은 그대로다.
//   남은 한계(guide/V4.md §10): 시드가 공개되면 결과를 미리 계산할 수 있고(GiwaGuilds.settleRun 주석), 함정을 밟은 회차도
//   앞부분만으로 다시 정산할 수 있다(되돌림이 정산 표시를 지운다). 둘 다 걸음마다 온체인에 봉인해야 막힌다 — 설계로만 둔다.
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

/** 기척이 참을 말하는 경계 — 바이트 하나가 이보다 작으면 참 (205/256 ≈ 0.80, 열에 여덟) */
export const OMEN_ACCURACY_LT = 205;

/** 기척 문구 — 웹 · Unity 화면이 함께 읽는다(Unity 는 굽는다). "함정 "으로 시작하는 글자를 두지 않는다 */
export const OMEN_WORDS: Record<DoorOutcome, string> = {
  safe: "너머가 고요하다",
  bonus: "너머에 순풍이 분다",
  trap: "너머에서 으르렁거린다",
};
export const OMEN_NOTE = "기척은 열에 여덟은 맞는다";

/** 걸음 하나의 기척 — 어느 문(door)에서 무엇이 들리는가(shows). 참인지는 알려 주지 않는다 */
export interface Omen {
  door: number;
  shows: DoorOutcome;
}

const OUTCOMES: readonly DoorOutcome[] = ["safe", "bonus", "trap"];

/**
 * 이 걸음(step)의 기척 — 문을 고르기 전에 문 하나의 결과를 들려준다. 체인에는 없는 클라이언트 힌트다.
 * doorRoll 과 다른 해시 영역("omen" 꼬리)에서 뽑으므로 문 판정은 한 비트도 바뀌지 않는다.
 *   d = keccak256(abi.encodePacked(seed, guildId, attempt, step, "omen"))
 *   문 = (d[0]<<8 | d[1]) % 3  ·  d[2] < OMEN_ACCURACY_LT 면 그 문의 참 결과,
 *   아니면 나머지 두 결과 중 d[3]&1 번째(safe·bonus·trap 순서에서 참을 뺀 것)
 */
export function omenAt(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
): Omen {
  const d = hexToBytes(
    keccak256(
      encodePacked(
        ["bytes32", "uint256", "uint32", "uint256", "string"],
        [seed, guildId, attempt, BigInt(step), "omen"],
      ),
    ),
  );
  const door = ((d[0] << 8) | d[1]) % 3;
  const truth = doorRoll(seed, guildId, attempt, step, door);
  if (d[2] < OMEN_ACCURACY_LT) return { door, shows: truth };
  return { door, shows: OUTCOMES.filter((o) => o !== truth)[d[3] & 1] };
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
