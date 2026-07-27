// 반입한 소리 조각 — 합성이 약한 자리만 채운다.
//
// 무엇을 받았고 무엇을 안 받았는가는 취향이 아니라 규칙이다:
//   · 받는다 — 발소리·동전·문·타격처럼 **한 번 나고 마는 실물 소리**. 이런 건
//     아무리 잘 합성해도 "전자음"으로 들린다.
//   · 안 받는다 — 배경음. 끝나지 않고 매번 다른 것은 절차 생성이 이긴다.
//
// 파일이 없어도 마을은 조용해지지 않는다. 여기 있는 모든 재생 함수는 실패하면
// false를 돌려주고, 부르는 쪽이 원래 쓰던 합성음으로 조용히 되돌아간다 —
// 오프라인·404·디코드 실패 어느 쪽이든 마찬가지다.

import { liveAudioCtx, sfxBus } from "./audio";

/** Vite base — 데모는 /giwa-village/ 아래에 올라간다 */
const BASE = import.meta.env.BASE_URL || "/";

/** 한 이름에 여러 개면 부를 때마다 다른 것이 나온다 (같은 소리가 반복되면 티가 난다) */
const FILES: Record<string, string[]> = {
  step: ["step0", "step1", "step2", "step3", "step4"].map((n) => `audio/sfx/${n}.ogg`),
  hit: ["hit0", "hit1", "hit2"].map((n) => `audio/sfx/${n}.ogg`),
  thud: ["audio/sfx/thud.ogg"],
  bell: ["audio/sfx/bell.ogg"],
  coins: ["audio/sfx/coins.ogg"],
  open: ["audio/sfx/open.ogg"],
  close: ["audio/sfx/close.ogg"],
  stall: ["audio/sfx/stall.ogg"],
  click: ["audio/sfx/click.ogg"],
  slice: ["audio/sfx/slice.ogg"],
  fire: ["audio/amb/fire.ogg"],
};

const buffers = new Map<string, AudioBuffer[]>();
let started = false;

/**
 * 풍류를 켠 순간 배경에서 받아 둔다. 기다리지 않는다 — 덜 받은 동안 나는 소리는
 * 합성음으로 나가고, 받아지는 대로 조용히 바뀐다.
 */
export function preloadSamples(): void {
  if (started) return;
  started = true;
  const ctx = liveAudioCtx();
  if (!ctx) return;
  for (const [id, paths] of Object.entries(FILES)) {
    void Promise.all(
      paths.map(async (p) => {
        const res = await fetch(BASE + p);
        if (!res.ok) throw new Error(`${res.status} ${p}`);
        return ctx.decodeAudioData(await res.arrayBuffer());
      }),
    )
      .then((bufs) => buffers.set(id, bufs))
      .catch(() => {
        /* 없으면 없는 대로 — 합성음이 대신한다 */
      });
  }
}

export function sampleReady(id: string): boolean {
  return buffers.has(id);
}

export interface PlayOpts {
  gain?: number;
  /** 재생 속도 = 음높이. 매번 조금씩 흔들어야 연타가 기계처럼 들리지 않는다 */
  rate?: number;
  dest?: AudioNode;
  at?: number;
}

/**
 * 한 방 재생. 그 소리가 아직 없으면 false — 부르는 쪽이 합성음으로 폴백한다.
 * 손질(게인·피치)은 전부 여기서 한다. 파일 자체는 출처 그대로 둔다.
 */
export function playSample(id: string, o: PlayOpts = {}): boolean {
  const ctx = liveAudioCtx();
  const list = buffers.get(id);
  if (!ctx || !list?.length) return false;
  const dest = o.dest ?? sfxBus();
  if (!dest) return false;

  const src = ctx.createBufferSource();
  src.buffer = list[(Math.random() * list.length) | 0];
  src.playbackRate.value = o.rate ?? 1;
  const g = ctx.createGain();
  g.gain.value = o.gain ?? 0.5;
  src.connect(g);
  g.connect(dest);
  src.start(o.at ?? ctx.currentTime);
  return true;
}

/**
 * 자리 소리 — 모닥불처럼 한 지점에서 계속 나는 것. 거리에 따라 줄고 좌우로 돈다.
 * 파일이 없으면 null을 돌려주고, 부르는 쪽은 아무것도 하지 않는다.
 */
export function playLoopAt(
  id: string,
  x: number,
  y: number,
  z: number,
  gain = 0.5,
): (() => void) | null {
  const ctx = liveAudioCtx();
  const list = buffers.get(id);
  const dest = sfxBus();
  if (!ctx || !list?.length || !dest) return null;

  const src = ctx.createBufferSource();
  src.buffer = list[0];
  src.loop = true;
  const pan = ctx.createPanner();
  pan.panningModel = "HRTF";
  pan.distanceModel = "inverse";
  pan.refDistance = 2.5;
  pan.maxDistance = 34;
  pan.rolloffFactor = 1.6;
  pan.positionX.value = x;
  pan.positionY.value = y;
  pan.positionZ.value = z;
  const g = ctx.createGain();
  g.gain.value = gain;

  src.connect(g);
  g.connect(pan);
  pan.connect(dest);
  src.start();
  return () => {
    try {
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      src.stop(ctx.currentTime + 0.5);
    } catch {
      /* 이미 멎었으면 그만 */
    }
  };
}
