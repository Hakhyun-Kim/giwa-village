// 온체인 마을 공통 상수·상태
export interface LocalPos {
  x: number;
  z: number;
  rot: number;
  ready: boolean;
}

export const POS_SCALE = 100;

/** 자기 아바타 위치 참조 — startOnchainVillage가 주입한다 */
export const selfPos: { ref: LocalPos | null } = { ref: null };
