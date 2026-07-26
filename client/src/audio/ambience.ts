// 저잣거리 앰비언스 — 오디오 파일 없이 WebAudio로 즉석 생성하는 국악풍 배경음.
//
// 왜 절차 생성인가: 이 저장소는 3D 마을을 통째로 코드로 만든다(한옥·나무·
// 도깨비 전부 절차 생성). 배경음만 mp3를 얹으면 결이 어긋나고, 저장소 용량과
// 음원 라이선스 문제도 따라붙는다. 여기서는 평조 5음계를 골라 가야금 뜯는
// 소리와 대금 지속음, 풍경 소리를 규칙으로 흩뿌린다 — 같은 곡이 두 번 나오지
// 않고, 파일은 0바이트다.
//
// 배경음은 한 곡이 아니라 **상태**다. 도깨비 곁에 서면 북이 붙은 토벌 트랙으로
// 갈아타고, 도깨비가 깎일수록 빨라진다(track.ts의 표 한 곳이 정한다). 무엇을
// 언제 놓을지는 스텝 시퀀서가, 실제 예약은 룩어헤드 스케줄러가 맡는다.
//
// 기본은 **꺼짐**이다. 브라우저 자동재생 정책상 사용자 제스처 없이는 소리가
// 나지 않고, 데모 영상 녹화에도 영향을 주지 않아야 하기 때문. HUD의 토글로
// 켜면 그 선택만 localStorage에 남는다.

import {
  createAudioCtx,
  noise,
  noteHz,
  setSoundPreference,
  soundPreference,
  tone,
} from "./audio";
import { trackShape, type Mood, type TrackShape } from "./track";

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | null = null;
let running = false;

/** 가야금 뜯는 소리 — 날카로운 어택 뒤 길게 떨어지는 감쇠 */
function pluck(at: number, hz: number, gain: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const body = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.value = hz;
  // 현이 울리는 배음. 살짝 어긋나게 둬야 뜯는 맛이 산다.
  body.type = "sine";
  body.frequency.value = hz * 2.01;

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(hz * 7, at);
  filter.frequency.exponentialRampToValueAtTime(hz * 1.6, at + 0.9);
  filter.Q.value = 1.2;

  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + rand(1.6, 2.6));

  osc.connect(filter);
  body.connect(filter);
  filter.connect(env);
  env.connect(master);
  osc.start(at);
  body.start(at);
  osc.stop(at + 3);
  body.stop(at + 3);
}

/** 대금 지속음 — 숨결 섞인 긴 음, 느린 비브라토 */
function flute(at: number, hz: number, gain: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const vib = ctx.createOscillator();
  const vibAmt = ctx.createGain();
  const env = ctx.createGain();
  const dur = rand(2.6, 4.4);

  osc.type = "sine";
  osc.frequency.value = hz;
  vib.type = "sine";
  vib.frequency.value = rand(4.2, 5.6);
  vibAmt.gain.value = hz * 0.006;
  vib.connect(vibAmt);
  vibAmt.connect(osc.frequency);

  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.55);
  env.gain.setValueAtTime(gain, at + dur - 0.9);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  osc.connect(env);
  env.connect(master);
  osc.start(at);
  vib.start(at);
  osc.stop(at + dur + 0.1);
  vib.stop(at + dur + 0.1);
}

/** 처마 끝 풍경 — 아주 짧고 높은 한 점 */
function chime(at: number, hz: number, gain: number) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + rand(1.1, 1.9));
  osc.connect(env);
  env.connect(master);
  osc.start(at);
  osc.stop(at + 2);
}

/** 북 — 토벌 트랙의 맥박. 음정이 없으므로 잡음 한 방과 낮은 글라이드로 만든다 */
function drum(at: number, strong: boolean) {
  if (!ctx || !master) return;
  noise(ctx, at, strong ? 0.16 : 0.1, {
    hz: strong ? 150 : 260,
    q: 0.8,
    vol: strong ? 0.11 : 0.05,
    filter: "lowpass",
    dest: master,
  });
  if (strong) {
    tone(ctx, at, 96, 0.18, { type: "sine", vol: 0.07, glideTo: 48, dest: master });
  }
}

/** 심장박동 — 두 번 치고 쉰다. 도깨비가 빈사일 때만 돈다 */
function heartbeat(at: number) {
  if (!ctx || !master) return;
  for (const [dt, vol] of [
    [0, 0.075],
    [0.17, 0.055],
  ]) {
    tone(ctx, at + dt, 66, 0.16, { type: "sine", vol, glideTo: 34, dest: master });
  }
}

// 스텝 시퀀서의 상태. 악절(2~4음)과 여백을 오간다 — 쉼표가 없으면 가락이 아니라
// 배경 소음이 된다.
let beat = 0;
let degree = 5;
let notesLeft = 0;
let rest = 0;

/** 한 스텝. 이 자리에 무엇을 놓을지만 정한다 (예약은 부르는 쪽이 이미 했다) */
function step(at: number, sh: TrackShape) {
  beat++;
  if (sh.drumEvery && beat % sh.drumEvery === 0) {
    drum(at, beat % (sh.drumEvery * 4) === 0);
  }
  if (sh.heartbeat && beat % 8 === 0) heartbeat(at);

  if (rest > 0) {
    rest--;
    return;
  }

  pluck(at, noteHz(degree + sh.degreeShift), sh.gain * rand(0.7, 1.3));
  // 5음계 안에서 한두 칸씩만 움직여야 가락처럼 들린다
  degree = Math.max(0, Math.min(13, degree + Math.round(rand(-2, 2))));

  if (--notesLeft > 0) {
    rest = Math.floor(rand(1, 3)); // 음과 음 사이
    return;
  }

  // 악절이 끝났다 — 가끔 대금이 받쳐 주고, 드물게 풍경이 울린 뒤 여백
  notesLeft = Math.floor(rand(2, 5));
  rest = Math.floor(rand(sh.restMin, sh.restMax));
  if (Math.random() < 0.45) {
    flute(at + rand(0.2, 1.2), noteHz(Math.floor(rand(0, 5)) + sh.degreeShift), rand(0.03, 0.055));
  }
  if (Math.random() < 0.3) {
    chime(at + rand(0.5, 2.5), noteHz(Math.floor(rand(12, 16))), rand(0.02, 0.04));
  }
}

// 룩어헤드 스케줄링: 타이머는 "앞으로 0.5초 안에 놓일 스텝"만 예약하고 물러난다.
// setTimeout으로 음 하나하나를 울리면 숨은 탭에서 스로틀돼 박자가 무너지지만,
// 예약은 오디오 시계 위에 찍히므로 타이머가 늦게 깨어나도 소리는 제자리에 난다.
const TICK_MS = 120;
const LOOKAHEAD = 0.5;
let nextAt = 0;

function tick() {
  if (!running || !ctx) return;
  // 탭이 오래 숨어 있었다면 밀린 스텝을 몰아치지 않는다 — 지금부터 다시 센다
  if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.06;
  const until = ctx.currentTime + LOOKAHEAD;
  while (nextAt < until) {
    const sh = trackShape(mood, hpRatio);
    step(nextAt, sh);
    nextAt += sh.stepSec;
  }
}

let mood: Mood = "village";
let hpRatio = 1;

/**
 * 지금 어떤 트랙을 돌지. 다음 스텝부터 바로 반영된다(트랙을 갈아엎지 않는다).
 * @param next 마을 평상 / 도깨비 토벌
 * @param hp 도깨비에게 남은 체력 비율 0~1 — 깎일수록 트랙이 빨라진다
 */
export function setMood(next: Mood, hp = 1): void {
  mood = next;
  hpRatio = hp;
}

export function isAmbienceOn(): boolean {
  return running;
}

/** 사용자가 저장해 둔 선택 (기본값 = 꺼짐) — 효과음도 같은 선택을 따른다 */
export function ambiencePreference(): boolean {
  return soundPreference();
}

/**
 * 켜기/끄기. 반드시 사용자 제스처(클릭) 안에서 호출해야 한다 —
 * 자동재생 정책 때문에 그 밖에서는 AudioContext가 suspended로 남는다.
 */
export async function setAmbience(on: boolean): Promise<boolean> {
  setSoundPreference(on);

  if (!on) {
    running = false;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (master && ctx) {
      // 뚝 끊기면 클릭 노이즈가 나므로 짧게 페이드아웃
      master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
    return false;
  }

  if (!ctx) {
    ctx = createAudioCtx();
    if (!ctx) return false;
    master = ctx.createGain();
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") await ctx.resume();
  if (!master) return false;

  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.8);

  if (!running) {
    running = true;
    nextAt = ctx.currentTime + 0.1;
    tick();
    timer = window.setInterval(tick, TICK_MS);
  }
  return true;
}
