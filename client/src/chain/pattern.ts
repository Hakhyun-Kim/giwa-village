// 문양의 순수 규칙 — 8x8 픽셀 · 4색 팔레트의 인코딩과 "따라 그리기" · PNG 파일 이름.
// 지갑도 DOM 도 모르는 모듈이라 npm test 가 그대로 걸어 본다.

/** 16색 프리셋 — 팔레트는 이 중 4색의 인덱스 */
export const PRESET16 = [
  "#00000000", // 0 = 투명
  "#1c1c22",
  "#ffffff",
  "#b8433a",
  "#e07b39",
  "#ffd66b",
  "#7de08a",
  "#3f7d5a",
  "#7db7ff",
  "#3d5a8f",
  "#b48cff",
  "#ff9ec1",
  "#c9a86a",
  "#6b4a30",
  "#8fe8e0",
  "#9a958a",
] as const;

/** 픽셀 배열(64개, 0..3) → bytes16 hex */
export function encodePixels(cells: number[]): `0x${string}` {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 64; i++) {
    const v = (cells[i] ?? 0) & 3;
    bytes[i >> 2] |= v << (6 - 2 * (i & 3));
  }
  return ("0x" +
    [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/** bytes16 hex → 픽셀 배열(64개, 0..3) */
export function decodePixels(hex: string): number[] {
  const cells = new Array<number>(64).fill(0);
  const h = hex.replace(/^0x/, "");
  for (let i = 0; i < 64; i++) {
    const byte = parseInt(h.slice((i >> 2) * 2, (i >> 2) * 2 + 2) || "0", 16);
    cells[i] = (byte >> (6 - 2 * (i & 3))) & 3;
  }
  return cells;
}

export function paletteSlot(palette: number, slot: number): string {
  return PRESET16[(palette >> (12 - 4 * slot)) & 0xf];
}

export function encodePalette(slots: number[]): number {
  return (
    ((slots[0] & 0xf) << 12) |
    ((slots[1] & 0xf) << 8) |
    ((slots[2] & 0xf) << 4) |
    (slots[3] & 0xf)
  );
}

/** 문양 이름의 길이 한도 — 공방 입력칸(maxLength)과 같다 */
export const DESIGN_NAME_MAX = 36;

/**
 * 장터의 문양을 내 그리기판으로 옮긴다(따라 그리기). 체인에는 아무것도 쓰지 않는다 —
 * 등록은 여전히 사람이 누른다. 이름에 원본 번호를 남겨 누구의 문양에서 시작했는지 밝힌다.
 */
export function remixDraft(
  pixelsHex: string,
  palette: number,
  id: number,
  name: string,
): { cells: number[]; slots: number[]; name: string } {
  const slots = [0, 1, 2, 3].map((sl) => (palette >> (12 - 4 * sl)) & 0xf);
  const suffix = ` 변형 (#${id})`;
  const base = name.trim().slice(0, Math.max(0, DESIGN_NAME_MAX - suffix.length));
  return { cells: decodePixels(pixelsHex), slots, name: (base + suffix).trim().slice(0, DESIGN_NAME_MAX) };
}

/**
 * 문양을 PNG 로 받을 때의 파일 이름 — giwa-munyang-<번호>-<이름>.png.
 * 글자 · 숫자(한글 포함)만 남기고 나머지는 '-' 하나로 접는다. 경로 문자는 남지 않는다.
 */
export function designFileName(id: number, name: string): string {
  const slug = name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/, "");
  return `giwa-munyang-${id}${slug ? `-${slug}` : ""}.png`;
}
