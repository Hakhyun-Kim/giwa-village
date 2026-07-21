// 저잣거리 앰비언스 — 오디오 파일 없이 WebAudio로 즉석 생성하는 국악풍 배경음.
//
// 왜 절차 생성인가: 이 저장소는 3D 마을을 통째로 코드로 만든다(한옥·나무·
// 도깨비 전부 절차 생성). 배경음만 mp3를 얹으면 결이 어긋나고, 저장소 용량과
// 음원 라이선스 문제도 따라붙는다. 여기서는 평조 5음계를 골라 가야금 뜯는
// 소리와 대금 지속음, 풍경 소리를 규칙으로 흩뿌린다 — 같은 곡이 두 번 나오지
// 않고, 파일은 0바이트다.
//
// 기본은 **꺼짐**이다. 브라우저 자동재생 정책상 사용자 제스처 없이는 소리가
// 나지 않고, 데모 영상 녹화에도 영향을 주지 않아야 하기 때문. HUD의 토글로
// 켜면 그 선택만 localStorage에 남는다.

const STORAGE_KEY = "giwa-ambience";

/** 평조(平調) 5음 — 황종·태주·중려·임종·남려에 해당하는 반음 간격 */
const PENTATONIC = [0, 2, 5, 7, 9];
const ROOT_HZ = 261.63; // C4

function noteHz(degree: number): number {
  const octave = Math.floor(degree / PENTATONIC.length);
  const step = PENTATONIC[((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length];
  return ROOT_HZ * Math.pow(2, octave + step / 12);
}

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

/**
 * 한 악절. 가야금 몇 음을 흩뿌리고, 가끔 대금이 받쳐 주고,
 * 드물게 풍경이 울린다. 다음 악절까지의 간격도 매번 다르다.
 */
function phrase(): number {
  if (!ctx) return 6;
  const now = ctx.currentTime + 0.15;
  const notes = Math.floor(rand(2, 5));
  let t = now;
  let degree = Math.floor(rand(2, 9));

  for (let i = 0; i < notes; i++) {
    pluck(t, noteHz(degree), rand(0.05, 0.1));
    // 5음계 안에서 한두 칸씩만 움직여야 가락처럼 들린다
    degree += Math.round(rand(-2, 2));
    degree = Math.max(0, Math.min(13, degree));
    t += rand(0.45, 1.15);
  }

  if (Math.random() < 0.45) {
    flute(now + rand(0.2, 1.2), noteHz(Math.floor(rand(0, 5))), rand(0.03, 0.055));
  }
  if (Math.random() < 0.3) {
    chime(now + rand(0.5, 2.5), noteHz(Math.floor(rand(12, 16))), rand(0.02, 0.04));
  }

  return (t - now) + rand(2.5, 6.0);
}

function loop() {
  if (!running) return;
  const nextIn = phrase();
  timer = window.setTimeout(loop, nextIn * 1000);
}

export function isAmbienceOn(): boolean {
  return running;
}

/** 사용자가 저장해 둔 선택 (기본값 = 꺼짐) */
export function ambiencePreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * 켜기/끄기. 반드시 사용자 제스처(클릭) 안에서 호출해야 한다 —
 * 자동재생 정책 때문에 그 밖에서는 AudioContext가 suspended로 남는다.
 */
export async function setAmbience(on: boolean): Promise<boolean> {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* 시크릿 모드 등 — 저장 실패는 무시하고 이번 세션만 적용 */
  }

  if (!on) {
    running = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (master && ctx) {
      // 뚝 끊기면 클릭 노이즈가 나므로 짧게 페이드아웃
      master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
    return false;
  }

  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
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
    loop();
  }
  return true;
}
