// 주민 혼잣말 고르기 — 지갑도 DOM 도 모르는 순수 모듈이라 npm test 가 그대로 걸어 본다.
// 장터 맨 위 '⭐ 오늘의 문양'은 공방 창을 열어야 보인다. 광장을 걷는 주민이 가끔 그 이름을
// 입에 올려, 공방에 들르지 않은 사람에게도 밀려난 문양이 다시 들리게 한다.

/** 혼잣말 중 오늘의 문양을 말하는 몫 — 넷에 하나 */
export const PICK_LINE_SHARE = 0.25;

/** 문양 이름을 말풍선에 올릴 때의 최대 길이 — 넘으면 줄인다 */
const NAME_MAX = 16;

export function pickLine(name: string): string {
  const n = name.trim();
  const short = n.length > NAME_MAX ? `${n.slice(0, NAME_MAX)}…` : n;
  return `오늘 공방 맨 위 문양은 “${short}” — 한번 들러 봐요`;
}

/**
 * 이번 혼잣말 — roll(0~1) 이 몫 안이고 오늘의 문양 이름을 실제로 읽어 왔을 때만 그 이름을 말한다.
 * 읽지 못했으면(오프라인 · 문양 셋 이하) 늘 하던 혼잣말 그대로. 이름을 지어내지 않는다.
 */
export function idleLine(personaLine: string, pickName: string | null, roll: number): string {
  if (pickName && pickName.trim() && roll < PICK_LINE_SHARE) return pickLine(pickName);
  return personaLine;
}

/**
 * 주민을 눌렀을 때 그 주민이 건네는 다음 한 걸음 — 촌장의 부탁이 지금 가리키는 것 그대로.
 * 부탁이 없거나(끝냈다 · 접었다 · 시연 중) 길을 고르는 중이면 null — 주민은 늘 하던 대로다.
 */
export function nextStepLine(step: { title: string; hint: string } | null): string | null {
  if (!step || !step.title.trim()) return null;
  return step.hint.trim() ? `다음은 ‘${step.title}’ 차례요 — ${step.hint}` : `다음은 ‘${step.title}’ 차례요`;
}
