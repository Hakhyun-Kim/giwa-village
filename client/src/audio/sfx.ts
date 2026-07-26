// 효과음 — 오디오 파일 0개. 배경음과 같은 평조 어휘를 쓰되, 여기서는 가락이 아니라
// "방금 무슨 일이 일어났는가"를 알리는 짧은 신호만 만든다.
//
// 규칙 셋:
//  · 성공은 올라가고 실패는 내려간다 — 화면을 안 보고 있어도 결과를 안다.
//  · 연달아 날 수 있는 소리(타격)는 레이트 리밋 — 연타해도 기관총처럼 뭉개지지 않게.
//  · 소리를 켠 적 없는 방문자에게는 아무 것도 울리지 않는다. 효과음은 컨텍스트를
//    새로 만들지 않고, 배경음 토글이 이미 열어 둔 컨텍스트에만 얹힌다.
//
// 원시 도구는 둘뿐이다 — 음(tone)과 잡음(noise). 나머지는 전부 이 둘의 조합이다.

import { liveAudioCtx, noteHz, soundPreference } from "./audio";

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  glideTo?: number;
}

function tone(ctx: AudioContext, at: number, hz: number, dur: number, o: ToneOpts = {}) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = o.type ?? "triangle";
  osc.frequency.setValueAtTime(hz, at);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, at + dur);

  const vol = o.vol ?? 0.08;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(vol, at + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

function noise(ctx: AudioContext, at: number, dur: number, hz: number, q: number, vol: number) {
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = hz;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vol, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(filter);
  filter.connect(env);
  env.connect(ctx.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** 소리를 낼 수 있는 상태일 때만 컨텍스트와 시작 시각을 넘겨준다 */
function play(fn: (ctx: AudioContext, at: number) => void): void {
  if (!soundPreference()) return;
  const ctx = liveAudioCtx();
  if (!ctx) return;
  fn(ctx, ctx.currentTime + 0.01);
}

/** 지갑이 tx를 받아들였다 — 두 음 상승, 아주 짧게 */
export function sfxSent(): void {
  play((ctx, at) => {
    tone(ctx, at, noteHz(5), 0.09, { vol: 0.05 });
    tone(ctx, at + 0.07, noteHz(8), 0.14, { vol: 0.05 });
  });
}

/** 거절·잔액 부족 — 두 음 하강, 기죽지 않게 부드럽게 */
export function sfxFail(): void {
  play((ctx, at) => {
    tone(ctx, at, noteHz(4), 0.14, { type: "sine", vol: 0.06 });
    tone(ctx, at + 0.1, noteHz(1), 0.3, { type: "sine", vol: 0.05 });
  });
}

/** 거래 확정·쿠폰 수령 — 상승 아르페지오 (평조 네 음) */
export function sfxSuccess(): void {
  play((ctx, at) => {
    [0, 2, 4, 7].forEach((d, i) => {
      tone(ctx, at + i * 0.075, noteHz(d + 5), 0.2, { vol: 0.055 });
    });
  });
}

// 도깨비 타격은 여럿이 동시에 때리므로 최소 간격을 둔다 (실측: 70ms면 연타가 살아 있다)
let lastHit = 0;
/** 도깨비 타격 — 짧은 필터드 잡음 한 방 */
export function sfxHit(): void {
  const now = performance.now();
  if (now - lastHit < 70) return;
  lastHit = now;
  play((ctx, at) => {
    noise(ctx, at, 0.06, 1500, 1.1, 0.14);
    tone(ctx, at, 180, 0.09, { type: "square", vol: 0.05, glideTo: 70 });
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
