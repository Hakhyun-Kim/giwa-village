// 모바일 가상 조이스틱 입력 채널 — TouchControls가 쓰고 Player가 읽는다.
// 화면 기준: 오른쪽 드래그 = +x, 아래 드래그 = +z (카메라가 북쪽을 보는 월드와 일치)
export const touchInput = { x: 0, z: 0 };

/** 손가락이 주 입력인 기기 — 안내 글자(키 대신 단추) · 화소 밀도 상한이 이것을 본다 */
export const TOUCH =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;
