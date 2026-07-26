// 풍류 트랙 — "지금 무슨 일이 벌어지고 있는가"를 소리의 모양으로 바꾸는 표.
//
// Web Audio를 모르는 순수 모듈이다. 그래서 브라우저 없이 npm test가 그대로 불러
// 검사한다 — 소리는 귀로만 확인할 수 있어서 규칙을 코드 밖에 두면 아무도 못 지킨다.
//
// 규칙 둘:
//  · 마을은 여백이 길고 느리다. 토벌은 북이 붙고, 도깨비가 깎일수록 빨라진다.
//    (진행도가 템포를 올리는 것 — 남은 체력을 안 봐도 막바지인 걸 안다)
//  · 심장박동이 도는 순간과 이름표가 붉게 맥동하는 순간은 **같아야 한다.**
//    그래서 그 임계는 여기 한 곳에 있고, 그리는 쪽도 이 함수를 부른다.

export type Mood = "village" | "hunt";

/** 도깨비가 빈사로 보이는 지점 (남은 체력 비율) */
export const LOW_HP = 0.2;

/** 빈사인가 — 붉은 맥동(화면)과 심장박동(소리)이 이 하나를 같이 본다 */
export function isLowHp(hpRatio: number): boolean {
  return hpRatio < LOW_HP;
}

export interface TrackShape {
  /** 한 스텝의 길이(초). 작을수록 빠르다 */
  stepSec: number;
  /** 5음계 자리 이동 — 음수면 낮게 깔린다 */
  degreeShift: number;
  /** 가야금 세기 */
  gain: number;
  /** 악절과 악절 사이 여백(스텝 수) */
  restMin: number;
  restMax: number;
  /** 북을 넣는 주기(스텝). 0이면 북이 없다 */
  drumEvery: number;
  /** 심장박동 */
  heartbeat: boolean;
}

/**
 * @param hpRatio 도깨비에게 남은 체력 비율 0~1 (마을 트랙에서는 쓰이지 않는다).
 *   화면과 같은 값을 그대로 받는다 — 여기서 뒤집었다가 되돌리면 경계에서
 *   부동소수 오차만큼 어긋나 심장박동과 붉은 맥동이 다른 순간에 켜진다.
 */
export function trackShape(mood: Mood, hpRatio = 1): TrackShape {
  const hp = Math.max(0, Math.min(1, hpRatio));
  if (mood === "hunt") {
    return {
      // 0.34 → 0.22초. 다 깎을 즈음엔 마을보다 두 배 가까이 빠르다
      stepSec: 0.22 + hp * 0.12,
      degreeShift: -3, // 낮게 깔아야 같은 5음계인데도 다른 장면으로 들린다
      gain: 0.085,
      restMin: 1,
      restMax: 4,
      drumEvery: 2,
      heartbeat: isLowHp(hp),
    };
  }
  return {
    stepSec: 0.42,
    degreeShift: 0,
    gain: 0.075,
    restMin: 7,
    restMax: 16, // 3~6초의 침묵 — 장터는 소리로 채우는 곳이 아니다
    drumEvery: 0,
    heartbeat: false,
  };
}
