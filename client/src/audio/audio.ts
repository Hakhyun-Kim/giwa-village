// 오디오 공용 — AudioContext는 하나만 만들어 배경음(ambience)과 효과음(sfx)이 나눠 쓴다.
//
// 브라우저 자동재생 정책상 사용자 제스처 없이는 소리가 나지 않는다. 그래서 컨텍스트는
// 게으르게 만들고, resume은 제스처 안에서 불리는 쪽(HUD의 풍류 토글)이 맡는다.
// 효과음은 컨텍스트를 새로 만들지 않고 이미 살아 있을 때만 울린다 — 소리를 켠 적 없는
// 방문자에게 갑자기 소리가 나는 일이 없어야 하기 때문.
//
// 음계도 여기 둔다. 배경음과 효과음이 같은 어휘(평조 5음)를 쓰지 않으면 효과음만
// 다른 게임에서 온 것처럼 들린다.
//
// 원시 도구도 둘뿐이다 — 음(tone)과 잡음(noise). 배경음의 북도, 효과음의 타격도
// 전부 이 둘의 조합이다. 두 파일에 같은 버퍼 코드를 복사해 두면 한쪽만 고쳐지므로
// 여기 한 곳에 둔다.

const STORAGE_KEY = "giwa-ambience"; // 기존 방문자의 선택을 잃지 않도록 키 이름은 유지

let ctx: AudioContext | null = null;

/** 필요하면 만들어서 돌려준다. 반드시 사용자 제스처 안에서 부를 것. */
export function createAudioCtx(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** 이미 만들어져 재생 중인 컨텍스트만 — 효과음이 컨텍스트를 새로 여는 것을 막는다 */
export function liveAudioCtx(): AudioContext | null {
  return ctx && ctx.state === "running" ? ctx : null;
}

/** 사용자가 저장해 둔 선택 (기본값 = 꺼짐) */
export function soundPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundPreference(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* 시크릿 모드 등 — 저장 실패는 무시하고 이번 세션만 적용 */
  }
}

/** 평조(平調) 5음 — 황종·태주·중려·임종·남려에 해당하는 반음 간격 */
export const PENTATONIC = [0, 2, 5, 7, 9];
const ROOT_HZ = 261.63; // C4

/** 5음계의 degree번째 음 (옥타브를 넘어가면 자동으로 올라간다) */
export function noteHz(degree: number): number {
  const octave = Math.floor(degree / PENTATONIC.length);
  const step =
    PENTATONIC[((degree % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length];
  return ROOT_HZ * Math.pow(2, octave + step / 12);
}

// ── 원시 도구 둘 ──────────────────────────────────────────────────────────
// dest를 주지 않으면 스피커로 바로 나간다(효과음). 배경음은 자기 master 게인을
// 넘겨 한 번에 페이드아웃할 수 있게 한다.

export interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  /** 이 주파수까지 미끄러진다 (하강이면 '풀 죽는' 소리, 상승이면 '차오르는' 소리) */
  glideTo?: number;
  dest?: AudioNode;
}

/** ① 음 — 오실레이터 하나 + 게인 엔벨로프 */
export function tone(
  ctx: AudioContext,
  at: number,
  hz: number,
  dur: number,
  o: ToneOpts = {},
): void {
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
  env.connect(o.dest ?? ctx.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

export interface NoiseOpts {
  hz?: number;
  q?: number;
  vol?: number;
  filter?: BiquadFilterType;
  dest?: AudioNode;
}

/** ② 잡음 — 화이트노이즈 → 필터. 타격·북처럼 음정이 없는 소리는 전부 여기서 나온다 */
export function noise(
  ctx: AudioContext,
  at: number,
  dur: number,
  o: NoiseOpts = {},
): void {
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter ?? "bandpass";
  filter.frequency.value = o.hz ?? 1200;
  filter.Q.value = o.q ?? 1;
  const env = ctx.createGain();
  env.gain.setValueAtTime(o.vol ?? 0.1, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(filter);
  filter.connect(env);
  env.connect(o.dest ?? ctx.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}
