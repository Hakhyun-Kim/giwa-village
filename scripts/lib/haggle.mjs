// 흥정 판단의 핵심 규칙 — 체인도 모델도 없이 순수하게 계산된다.
// 상인 봇(scripts/merchant-bot.mjs)과 무가스 테스트(scripts/test-logic.mjs)가
// 같은 함수를 쓴다. 안전 불변식이 여기 한 곳에만 있어야 테스트가 의미를 가진다.

/** 판단 구간 */
export const BAND = {
  /** 정가 이상 — 모델을 부르지 않고 수락 */
  ABOVE_LIST: "정가 이상",
  /** 하한선 미만 — 모델을 부르지 않고 거절 */
  BELOW_FLOOR: "하한선 미만",
  /** 그 사이 — 모델이 판단할 수 있는 유일한 구간 */
  NEGOTIABLE: "흥정 구간",
};

/** 정가 × 비율 (bigint 유지 — 부동소수 오차로 하한선이 새면 안 된다) */
export function floorOf(listPrice, floorRatio) {
  return (listPrice * BigInt(Math.round(floorRatio * 1000))) / 1000n;
}

/**
 * 제안이 어느 구간에 속하는지. 모델은 NEGOTIABLE일 때만 호출된다.
 */
export function classify(offerAmount, listPrice, floorRatio) {
  const floor = floorOf(listPrice, floorRatio);
  if (offerAmount >= listPrice) return { band: BAND.ABOVE_LIST, floor };
  if (offerAmount < floor) return { band: BAND.BELOW_FLOOR, floor };
  return { band: BAND.NEGOTIABLE, floor };
}

/**
 * 모델 없이 판단할 때의 규칙 — 하한선과 정가 사이의 중간을 넘으면 받는다.
 */
export function decideDeterministic(ratio, floorRatio) {
  const midpoint = floorRatio + (1 - floorRatio) / 2;
  const accept = ratio >= midpoint;
  return {
    accept,
    line: accept ? "그 값이면 가져가시오." : "그건 좀 과하오, 조금만 더 얹으시오.",
  };
}

/**
 * 최종 관문. 어떤 경로(모델·결정론·수동)로 온 결정이든 여기를 통과해야 한다.
 * 하한선 아래를 수락하려는 시도는 언제나 거부된다 — 이것이 이 봇의 안전 불변식이다.
 */
export function enforce(decision, offerAmount, listPrice, floorRatio) {
  const { band, floor } = classify(offerAmount, listPrice, floorRatio);
  if (decision.accept && offerAmount < floor) {
    return { accept: false, line: decision.line, blocked: true, band, floor };
  }
  return { ...decision, blocked: false, band, floor };
}
