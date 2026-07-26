// 자동화 훅 — 사람이 아닌 것(스모크 스크립트·에이전트)이 이 마을을 검사할 때 쓰는 창구.
//
// 두 가지뿐이다:
//  ?rafshim  숨은 탭에서는 requestAnimationFrame이 초당 1회로 스로틀돼 헤드리스
//            검증이 사실상 멈춘다. 타이머로 갈아끼워 배경에서도 프레임이 돈다.
//  window.__giwa  상태 조회·순간이동. 개발 서버이거나 ?debug 일 때만 붙는다 —
//            공개 데모에 조작 창구를 남겨두지 않기 위해서.
//
// 여기서 잡은 예외는 절대 삼키지 않는다. 스모크의 합격 기준이 "콘솔 에러 0"이라
// 삼키는 순간 검사가 죽는다.

import { useStore } from "../state/store";
import { selfPos } from "../chain/core";
import { bossHit } from "../game/feel";
import { PLAYER_R, VILLAGE_COLLIDERS, insideAny } from "../game/collide";
import { setMood } from "../audio/ambience";
import { trackShape, type Mood } from "../audio/track";

const FRAME_MS = 1000 / 30;

function installRafShim(): void {
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    queue.delete(id);
  };

  setInterval(() => {
    if (queue.size === 0) return;
    const due = [...queue.values()];
    queue.clear();
    const now = performance.now();
    for (const cb of due) {
      try {
        cb(now);
      } catch (err) {
        // 한 콜백이 터져도 나머지 프레임은 돌리되, 에러 자체는 그대로 드러낸다
        setTimeout(() => {
          throw err;
        });
      }
    }
  }, FRAME_MS);
}

export function installDevHooks(): void {
  const q = new URLSearchParams(location.search);
  if (q.has("rafshim")) installRafShim();
  if (!import.meta.env.DEV && !q.has("debug")) return;

  (window as unknown as { __giwa: unknown }).__giwa = {
    /** 스토어 스냅샷 — 지갑·노점·길드·도깨비까지 한 번에 */
    state: () => useStore.getState(),
    /** 내 아바타 위치 (없으면 아직 마을에 안 들어온 것) */
    pos: () => (selfPos.ref ? { x: selfPos.ref.x, z: selfPos.ref.z } : null),
    /** 노점 앞·모닥불 앞처럼 특정 지점을 검사할 때 */
    teleport: (x: number, z: number) => {
      if (!selfPos.ref) return false;
      selfPos.ref.x = x;
      selfPos.ref.z = z;
      return true;
    },
    /** 마을이 실제로 살아났는가 — 스모크의 1차 합격 조건 */
    ready: () =>
      useStore.getState().status === "connected" && !!selfPos.ref?.ready,
    /**
     * 도깨비 피격 연출만 흉내 낸다 — 타격감(섬광·흔들림·떠오르는 숫자)을
     * 가스 한 푼 없이 검증하기 위한 창구. 체인 상태는 건드리지 않는다.
     */
    bossHit: (amount?: number) => bossHit(amount),
    /**
     * 풍류 트랙을 직접 갈아 끼운다 — 도깨비를 실제로 빈사까지 깎지 않고도
     * "곁에 서면 북이 붙고, 깎일수록 빨라진다"를 측정할 수 있게. 소리는 귀로만
     * 확인되므로, 스케줄되는 노드 수를 세는 것이 유일한 자동 검증 수단이다.
     */
    mood: (name: Mood, hp = 1) => {
      setMood(name, hp);
      return trackShape(name, hp);
    },
    /**
     * 충돌 검사 창구 — 벽을 뚫는지 보려면 좌표를 알아야 한다.
     * walls()는 고정 배치만, blocked()는 그때그때 열린 노점·도깨비까지 본다.
     */
    walls: () => VILLAGE_COLLIDERS,
    blocked: (x: number, z: number) => insideAny(x, z, PLAYER_R),
  };
}
