// 주야 사이클 — KST 실시간에 따라 하늘·햇빛·등불을 바꾼다.
//
// 설계 원칙: **어두워도 플레이는 그대로 되어야 한다.** 밤에도 주변광과
// 달빛에 하한을 둬서 노점 간판·이름표·아이템이 계속 읽힌다. 완전한 암전은
// 없다 — 이 마을에서 밤은 난이도가 아니라 분위기다.
//
// 자동 시연(?showcase=1)과 데모 영상 녹화는 항상 낮으로 고정한다.
// 조명이 촬영 시각에 따라 달라지면 같은 스크립트가 다른 영상을 만들기 때문.
// 그래도 밤을 보고 싶으면 ?time=night 로 언제든 덮어쓸 수 있다.

export interface DaylightState {
  /** 하늘·안개 색 */
  sky: string;
  ambient: number;
  sunPosition: [number, number, number];
  sunIntensity: number;
  sunColor: string;
  /** 등불·모닥불 밝기 배수 (0=낮, 1=한밤) */
  lantern: number;
  label: string;
}

interface Key {
  h: number;
  sky: string;
  ambient: number;
  sunIntensity: number;
  sunColor: string;
  /** 태양 고도 (0=지평선, 1=천정) */
  alt: number;
  lantern: number;
  label: string;
}

// 하루의 키프레임. ambient/sunIntensity의 최솟값이 곧 야간 가독성의 하한이다.
const KEYS: Key[] = [
  { h: 0,  sky: "#141b2e", ambient: 0.38, sunIntensity: 0.36, sunColor: "#9fb4e8", alt: 0.62, lantern: 1.0, label: "한밤" },
  { h: 5,  sky: "#1d2740", ambient: 0.40, sunIntensity: 0.38, sunColor: "#9fb4e8", alt: 0.45, lantern: 0.95, label: "새벽" },
  { h: 7,  sky: "#7f9ac4", ambient: 0.50, sunIntensity: 0.85, sunColor: "#ffd9b0", alt: 0.22, lantern: 0.35, label: "아침" },
  { h: 10, sky: "#a8c6e4", ambient: 0.55, sunIntensity: 1.15, sunColor: "#ffffff", alt: 0.70, lantern: 0.0, label: "한낮" },
  { h: 15, sky: "#a8c6e4", ambient: 0.55, sunIntensity: 1.15, sunColor: "#fff6e6", alt: 0.62, lantern: 0.0, label: "한낮" },
  { h: 18, sky: "#d99a6c", ambient: 0.50, sunIntensity: 0.80, sunColor: "#ff9d5c", alt: 0.16, lantern: 0.45, label: "노을" },
  { h: 20, sky: "#40405f", ambient: 0.42, sunIntensity: 0.45, sunColor: "#b9a6d8", alt: 0.35, lantern: 0.9, label: "저녁" },
  { h: 24, sky: "#141b2e", ambient: 0.38, sunIntensity: 0.36, sunColor: "#9fb4e8", alt: 0.62, lantern: 1.0, label: "한밤" },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpHex(a: string, b: string, t: number) {
  const p = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(lerp(x, y, t)).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}

/** KST 기준 소수 시각 (0~24) */
export function kstHour(now = Date.now()): number {
  const kst = new Date(now + 9 * 3600 * 1000);
  return kst.getUTCHours() + kst.getUTCMinutes() / 60;
}

const FORCED: Record<string, number> = {
  dawn: 5.5,
  morning: 7.5,
  day: 12,
  noon: 12,
  dusk: 18,
  sunset: 18,
  evening: 20,
  night: 23,
};

/**
 * 이 프레임에 쓸 시각을 정한다.
 * 우선순위: ?time= 지정 > 쇼케이스(낮 고정) > 실제 KST.
 */
export function resolvedHour(now = Date.now()): number {
  if (typeof location === "undefined") return kstHour(now);
  const params = new URLSearchParams(location.search);
  const t = params.get("time");
  if (t) {
    const named = FORCED[t.toLowerCase()];
    if (named !== undefined) return named;
    const num = Number(t);
    if (Number.isFinite(num)) return ((num % 24) + 24) % 24;
  }
  // 자동 시연·녹화는 조명이 흔들리면 안 되므로 한낮 고정
  if (params.get("showcase") === "1") return 12;
  return kstHour(now);
}

export function daylightAt(hour: number): DaylightState {
  let i = 0;
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1].h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = b.h === a.h ? 0 : (hour - a.h) / (b.h - a.h);

  const alt = lerp(a.alt, b.alt, t);
  // 해는 동(+x)에서 떠서 서(-x)로 진다. 밤엔 반대편에서 달빛이 들어온다.
  const swing = Math.cos((hour / 24) * Math.PI * 2) * -1;
  return {
    sky: lerpHex(a.sky, b.sky, t),
    ambient: lerp(a.ambient, b.ambient, t),
    sunPosition: [swing * 30, 18 + alt * 34, 20],
    sunIntensity: lerp(a.sunIntensity, b.sunIntensity, t),
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    lantern: lerp(a.lantern, b.lantern, t),
    label: t < 0.5 ? a.label : b.label,
  };
}

export function currentDaylight(now = Date.now()): DaylightState {
  return daylightAt(resolvedHour(now));
}
