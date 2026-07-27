// 효과음 — 오디오 파일 0개. 배경음과 같은 평조 어휘를 쓰되, 여기서는 가락이 아니라
// "방금 무슨 일이 일어났는가"를 알리는 짧은 신호만 만든다.
//
// 규칙 셋:
//  · 성공은 올라가고 실패는 내려간다 — 화면을 안 보고 있어도 결과를 안다.
//  · 연달아 날 수 있는 소리(타격)는 레이트 리밋 — 연타해도 기관총처럼 뭉개지지 않게.
//  · 소리를 켠 적 없는 방문자에게는 아무 것도 울리지 않는다. 효과음은 컨텍스트를
//    새로 만들지 않고, 배경음 토글이 이미 열어 둔 컨텍스트에만 얹힌다.
//
// 원시 도구는 둘뿐이다 — 음(tone)과 잡음(noise). 나머지는 전부 이 둘의 조합이고,
// 도구 자체는 배경음과 나눠 쓰도록 audio.ts에 있다.

import { liveAudioCtx, noise, noteHz, soundPreference, tone } from "./audio";
import { playSample } from "./samples";

/** 매번 조금씩 다른 음높이 — 같은 파일도 연달아 나면 기계처럼 들린다 */
const wobble = (spread = 0.12) => 1 + (Math.random() * 2 - 1) * spread;

/** 소리를 낼 수 있는 상태일 때만 컨텍스트와 시작 시각을 넘겨준다 */
function play(fn: (ctx: AudioContext, at: number) => void): void {
  if (!soundPreference()) return;
  const ctx = liveAudioCtx();
  if (!ctx) return;
  fn(ctx, ctx.currentTime + 0.01);
}

/** 지갑이 tx를 받아들였다 — 쇠걸쇠 한 번 + 두 음 상승, 아주 짧게 */
export function sfxSent(): void {
  play((ctx, at) => {
    playSample("click", { gain: 0.22, rate: wobble(0.08) });
    tone(ctx, at, noteHz(5), 0.09, { vol: 0.05 });
    tone(ctx, at + 0.07, noteHz(8), 0.14, { vol: 0.05 });
  });
}

// 발소리는 걸음마다 나므로 가장 자주 울리는 소리다 — 조금만 크면 바로 거슬린다.
/** 한 걸음. 파일이 없으면 아주 짧은 흙 소리로 대신한다 */
export function sfxStep(): void {
  play((ctx, at) => {
    if (playSample("step", { gain: 0.16, rate: wobble(0.16) })) return;
    noise(ctx, at, 0.05, { hz: 420, q: 0.9, vol: 0.05, filter: "lowpass" });
  });
}

/** 다이얼로그가 열린다 — 책장 넘기는 소리 */
export function sfxOpen(): void {
  play((ctx, at) => {
    if (playSample("open", { gain: 0.3, rate: wobble(0.06) })) return;
    tone(ctx, at, noteHz(6), 0.1, { vol: 0.04 });
  });
}

/** 다이얼로그가 닫힌다 */
export function sfxClose(): void {
  play((ctx, at) => {
    if (playSample("close", { gain: 0.26, rate: wobble(0.06) })) return;
    tone(ctx, at, noteHz(3), 0.1, { vol: 0.035 });
  });
}

/** 노점을 편다 — 문 여는 소리 위에 상승 두 음 */
export function sfxStallOpen(): void {
  play((ctx, at) => {
    playSample("stall", { gain: 0.34 });
    tone(ctx, at + 0.12, noteHz(5), 0.16, { vol: 0.045 });
    tone(ctx, at + 0.24, noteHz(9), 0.3, { vol: 0.045 });
  });
}

/** 거절·잔액 부족 — 두 음 하강, 기죽지 않게 부드럽게 */
export function sfxFail(): void {
  play((ctx, at) => {
    tone(ctx, at, noteHz(4), 0.14, { type: "sine", vol: 0.06 });
    tone(ctx, at + 0.1, noteHz(1), 0.3, { type: "sine", vol: 0.05 });
  });
}

/** 거래 확정·쿠폰 수령 — 엽전 소리 위에 상승 아르페지오 (평조 네 음) */
export function sfxSuccess(): void {
  play((ctx, at) => {
    playSample("coins", { gain: 0.34, rate: wobble(0.06) });
    [0, 2, 4, 7].forEach((d, i) => {
      tone(ctx, at + i * 0.075, noteHz(d + 5), 0.2, { vol: 0.055 });
    });
  });
}

// 도깨비 타격은 여럿이 동시에 때리므로 최소 간격을 둔다 (실측: 70ms면 연타가 살아 있다)
let lastHit = 0;
/**
 * 도깨비 타격 — 세 겹으로 친다. 게임 타격음이 시원하게 들리는 이유는 대개
 * 소리가 커서가 아니라 **겹이 있어서**다:
 *   ① 트랜지언트(찰나의 잡음) — "닿았다"를 알리는 것. 늦으면 둔해진다.
 *   ② 바디(반입한 묵직한 타격) — 무게를 담당한다.
 *   ③ 테일(낮게 미끄러지는 음) — 여운. 리버브가 이걸 마당으로 퍼뜨린다.
 */
export function sfxHit(): void {
  const now = performance.now();
  if (now - lastHit < 70) return;
  lastHit = now;
  play((ctx, at) => {
    noise(ctx, at, 0.05, { hz: 1800, q: 1.2, vol: 0.11 }); // ①
    if (!playSample("hit", { gain: 0.42, rate: wobble(0.14) })) {
      // 파일이 없을 때의 바디 — 원래 쓰던 잡음 한 방
      noise(ctx, at, 0.07, { hz: 1200, q: 1, vol: 0.13 });
    }
    tone(ctx, at, 180, 0.11, { type: "square", vol: 0.05, glideTo: 70 }); // ③
  });
}

/**
 * 도깨비가 쓰러졌다 — 포효 뒤에 팡파레.
 * 주간에 한 번뿐인 순간이고 여럿이 함께 때려서 온 결과라, 여기서는 아끼지 않는다.
 * (그 밖의 소리는 전부 0.3초 안쪽이다 — 마을이 시끄러우면 안 되므로)
 */
export function sfxSlain(): void {
  play((ctx, at) => {
    // 쓰러지는 순간: 묵직한 한 방 + 낮게 무너지는 포효
    playSample("thud", { gain: 0.5, rate: 0.86 });
    tone(ctx, at, 200, 0.7, { type: "sawtooth", vol: 0.07, glideTo: 42 });
    noise(ctx, at, 0.55, { hz: 220, q: 0.7, vol: 0.09, filter: "lowpass" });
    // 마을에 알리는 종 — 팡파레보다 반 박자 먼저 들어간다
    playSample("bell", { gain: 0.4, at: at + 0.34 });
    // 팡파레: 평조 다섯 음을 밟고 올라가 마지막 음을 길게 끈다
    [0, 2, 4, 7, 9].forEach((d, i) => {
      tone(ctx, at + 0.5 + i * 0.11, noteHz(d + 5), i === 4 ? 0.8 : 0.22, { vol: 0.06 });
    });
  });
}

/**
 * 잭팟 — 에픽 장신구가 나왔다. 성공음(sfxSuccess)과 같은 상승이되 한 옥타브 위에서
 * 두 배로 길고, 끝에 풍경 소리가 얹힌다. 흔한 결과와 **소리로 구별되지 않으면**
 * 희귀한 것이 나온 줄도 모르고 지나간다.
 */
export function sfxJackpot(): void {
  play((ctx, at) => {
    [0, 2, 4, 7, 9, 12].forEach((d, i) => {
      tone(ctx, at + i * 0.085, noteHz(d + 8), i === 5 ? 0.9 : 0.22, { vol: 0.055 });
    });
    tone(ctx, at, noteHz(1), 1.1, { type: "sine", vol: 0.035 }); // 아래를 받치는 지속음
    tone(ctx, at + 0.55, noteHz(19), 1.3, { type: "sine", vol: 0.03 }); // 풍경 한 점
  });
}

/** 온기 수령 — 모닥불 팡파레 (아르페지오 위에 낮은 지속음) */
export function sfxWarm(): void {
  play((ctx, at) => {
    [0, 3, 5, 8, 10].forEach((d, i) => {
      tone(ctx, at + i * 0.09, noteHz(d + 3), 0.3, { vol: 0.05 });
    });
    tone(ctx, at, noteHz(-4), 0.9, { type: "sine", vol: 0.04 });
  });
}
