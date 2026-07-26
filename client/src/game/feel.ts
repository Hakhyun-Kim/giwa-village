// 게임필 — "화면이 반응한다"만 담당하는 모듈.
//
// zustand에 넣지 않는 이유: 이 값들은 매 프레임 바뀐다. 리액트 상태에 얹으면
// 흔들림 한 번에 씬 전체가 수십 번 다시 그려진다. 여기서는 평범한 변수로 두고
// useFrame이 읽어 간다 — 리렌더 0.
//
// 새로 만드는 것이 없다는 점이 요점이다. 파티클도, 메시도, 라이트도 추가하지
// 않는다. 이미 있는 카메라·재질·라이트의 숫자를 몇 프레임 흔들 뿐이라 저사양
// 기기에서도 비용이 사실상 0이다. 화면을 흔드는 연출은 멀미를 부를 수 있으므로
// prefers-reduced-motion 이면 흔들림만 끈다(피드백 자체는 남긴다).

const reduceMotion =
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 매 프레임 읽히는 값들 — 소비자는 읽기만 하고, 감쇠는 tickFeel 한 곳에서 한다 */
export const feel = {
  /** 카메라 흔들림 누적량 (0~0.8) */
  shake: 0,
  /** 도깨비 피격 섬광 (0~1) */
  bossFlash: 0,
};

export function addShake(v: number): void {
  if (reduceMotion) return;
  feel.shake = Math.min(0.8, feel.shake + v);
}

/** 프레임마다 한 번. 선형으로 줄이고, 쓰는 쪽에서 제곱해 쓴다 */
export function tickFeel(dt: number): void {
  feel.shake = Math.max(0, feel.shake - dt * 1.7);
  feel.bossFlash = Math.max(0, feel.bossFlash - dt * 3.2);
}

// ── 도깨비에게 떠오르는 숫자 ────────────────────────────────────────────────
// 몇 개 안 되는 DOM이라 리액트에 맡긴다(타격 쿨다운이 30초라 초당 수십 개가
// 될 수 없다). 다만 남이 때린 것도 뜨게 해서 "혼자가 아니다"가 보이게 한다.

export interface DamagePop {
  id: number;
  amount: number;
  /** 내 타격이면 크고 노랗게 */
  mine: boolean;
}

const listeners = new Set<(p: DamagePop) => void>();
let nextPopId = 1;

export function onDamagePop(fn: (p: DamagePop) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 도깨비가 맞았다.
 * @param amount 깎인 체력. 없으면 섬광만 (내가 R을 누른 순간 — 숫자는 체인이
 *   확정한 뒤에 따로 온다. 즉각 반응은 화면이, 사실 확인은 체인이 한다)
 */
export function bossHit(amount?: number, mine = true): void {
  feel.bossFlash = 1;
  addShake(mine ? 0.42 : 0.16);
  if (amount === undefined || amount <= 0) return;
  const pop = { id: nextPopId++, amount, mine };
  for (const fn of listeners) fn(pop);
}
