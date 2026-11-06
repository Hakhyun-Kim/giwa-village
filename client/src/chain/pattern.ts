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

/**
 * 따라 그린 문양의 원본 번호 — 이름이 remixDraft 가 채운 꼴 "… 변형 (#번호)" 로 끝날 때만.
 * 이름만 읽으므로 체인에는 아무것도 없고, 이름을 바꾼 문양은 원본 줄이 뜨지 않는다.
 */
export function remixSourceOf(name: string, selfId?: number): number | null {
  const m = /변형 \(#(\d{1,9})\)$/.exec(name.trim());
  if (!m) return null;
  const id = Number(m[1]);
  return id === selfId ? null : id;
}

/** 장터 맨 위 '오늘의 문양'이 고르지 않는 가장 새 문양 수 — 새 문양은 이미 위에 있다 */
export const PICK_SKIP_NEWEST = 3;

/**
 * 오늘의 문양 — 새 문양에 밀려 내려간 문양 하나를 KST 하루 동안 장터 맨 위에 올린다.
 * ids 는 장터 순서(새것 먼저). 같은 날이면 누구에게나 같은 것, 다음 날이면 다시 고른다.
 * 새 문양 몇 개를 빼고 남는 것이 없으면 고르지 않는다(null). 체인에는 아무것도 쓰지 않는다.
 */
export function designOfDay(ids: readonly number[], kstDay: string): number | null {
  const older = ids.slice(PICK_SKIP_NEWEST);
  if (older.length === 0) return null;
  let h = 0x811c9dc5; // FNV-1a — 날짜 글자만으로 정해지는 작은 해시
  for (let i = 0; i < kstDay.length; i++) {
    h ^= kstDay.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return older[h % older.length];
}

/**
 * 문양이 체인에 오른 날 — 컨트랙트가 문양과 함께 적어 둔 createdAt(초)을 KST 날짜로.
 * 마을 시각은 KST 다(장날과 같은 기준). 알 수 없으면 null — 지어내지 않는다.
 */
export function onChainSince(createdAt: number | bigint | undefined | null): string | null {
  if (createdAt === undefined || createdAt === null) return null;
  const sec = Number(createdAt);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(sec * 1000));
}

/** 문양 하나를 가리키는 링크의 쿼리 이름 — ?munyang=<번호> 로 열면 공방이 그 문양을 앞에 띄운다 */
export const DESIGN_PARAM = "munyang";

/** 지금 주소에서 다른 쿼리 · 조각을 걷어 내고 문양 번호 하나만 실은 링크 */
export function designLink(href: string, id: number): string {
  const u = new URL(href);
  u.search = "";
  u.hash = "";
  u.searchParams.set(DESIGN_PARAM, String(id));
  return u.toString();
}

/** 주소의 ?munyang= — 0 이상의 정수가 아니면 null (링크로 들어온 글자는 믿지 않는다) */
export function linkedDesignId(search: string): number | null {
  const v = new URLSearchParams(search).get(DESIGN_PARAM);
  if (v === null || !/^\d{1,9}$/.test(v)) return null;
  return Number(v);
}

/**
 * wornOf 의 답 → 아바타가 입는 무늬("pixels:palette")와 그 문양 번호.
 * 번호가 0 이거나 9자리를 넘으면 공방에서 찾아갈 수 없으므로 id 는 null 이다(무늬는 그대로 입는다).
 */
export function wornFrom(
  exists: boolean,
  id: bigint | number,
  pixels: string,
  palette: number,
): { code: string; id: number | null } | null {
  if (!exists) return null;
  const n = Number(id);
  return { code: `${pixels}:${palette}`, id: Number.isInteger(n) && n > 0 && n < 1e9 ? n : null };
}
