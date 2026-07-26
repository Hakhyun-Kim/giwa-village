// 마을 배치표와 충돌 — 로컬 전용.
//
// 위치는 체인도 서버도 강제하지 않는다(서버 0으로도 마을이 돌아야 하고, 남의
// 좌표를 검증할 이유도 없다). 여기 있는 것은 "내 화면에서 내 아바타가 한옥을
// 뚫고 지나가지 않게" 하는 것뿐이다. 그래서 원·회전 사각형 두 가지밖에 없다.
//
// 배치 좌표도 여기 산다. 그리는 쪽(Village.tsx)과 막는 쪽이 같은 표를 읽어야
// 보이는 것과 부딪히는 것이 어긋나지 않는다 — 어긋나면 npm test가 깨진다.

export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x: number; z: number; hw: number; hd: number; rot: number };

export const WORLD_RADIUS = 55;
export const PORTAL_POS: [number, number, number] = [0, 0, -30];
export const CAMPFIRE_POS: [number, number, number] = [-9, 0, 9];
export const BOSS_POS: [number, number, number] = [12, 0, 14];

/** 아바타 반지름 — 어깨가 벽에 살짝 못 미치는 정도 */
export const PLAYER_R = 0.42;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WALL_COLORS = ["#e8dcc8", "#e2d4bc", "#ded0b0", "#e5d9c5"];

/** 한옥 링 — 동쪽(식당가)과 북쪽(포털 길)은 비워둔다 */
export const HANOKS: {
  position: [number, number, number];
  rotation: number;
  tint: string;
}[] = (() => {
  const rand = mulberry32(20260718);
  const list: { position: [number, number, number]; rotation: number; tint: string }[] = [];
  // 남서~서~북서 구간에 배치
  const angles = [100, 130, 160, 195, 230, 255];
  for (let i = 0; i < angles.length; i++) {
    const a = (angles[i] * Math.PI) / 180;
    const r = 25 + rand() * 5;
    list.push({
      position: [Math.cos(a) * r, 0, Math.sin(a) * r],
      rotation: -a - Math.PI / 2,
      tint: WALL_COLORS[i % WALL_COLORS.length],
    });
  }
  return list;
})();

export const TREES: { position: [number, number, number]; scale: number; pine: boolean }[] = (() => {
  const rand = mulberry32(91342);
  const list: { position: [number, number, number]; scale: number; pine: boolean }[] = [];
  while (list.length < 20) {
    const angle = rand() * Math.PI * 2;
    const r = 13 + rand() * 38;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    const nearPortal = Math.hypot(x - PORTAL_POS[0], z - PORTAL_POS[2]) < 8;
    const inHanokBand = r > 22 && r < 33;
    const inFoodStreet = x > 10 && x < 34 && Math.abs(z) < 9;
    if (nearPortal || inHanokBand || inFoodStreet) continue;
    list.push({ position: [x, 0, z], scale: 0.8 + rand() * 0.7, pine: rand() > 0.5 });
  }
  return list;
})();

export const LANTERNS: [number, number][] = [
  [7, 7],
  [-7, 7],
  [7, -7],
  [-7, -7],
  [12, 3],
  [30, -1],
];

export const BILLBOARDS: {
  position: [number, number, number];
  rotation: number;
  text: string;
  sub: string;
}[] = [
  {
    position: [-3.4, 0, -22],
    rotation: 0.35,
    text: "광고 배너 자리",
    sub: "온체인 분양 예정 · ad@giwa.village",
  },
  {
    position: [12.5, 0, 8.5],
    rotation: -2.6,
    text: "GIWA 저잣거리",
    sub: "인증 상인 노점 환영 🧧",
  },
];

/** 한옥은 기단(벽보다 0.7 넓다)까지가 부딪히는 크기다 */
export function hanokCollider(
  x: number,
  z: number,
  rot: number,
  w = 4.6,
  d = 3.6,
): Collider {
  return { kind: "box", x, z, hw: (w + 0.7) / 2, hd: (d + 0.7) / 2, rot };
}

/** 노점 하나가 막는 크기 — 브랜드 상점은 건물이라 한옥과 같은 크기다 */
export function stallCollider(st: { x: number; z: number; brand?: boolean }): Collider {
  return st.brand
    ? hanokCollider(st.x, st.z, st.z > 0 ? Math.PI : 0, 5.2, 4)
    : { kind: "box", x: st.x, z: st.z, hw: 1.05, hd: 0.72, rot: 0 };
}

/** 항상 그 자리에 있는 것들 */
export const VILLAGE_COLLIDERS: Collider[] = [
  // 분수
  { kind: "circle", x: 0, z: 0, r: 2.6 },
  ...HANOKS.map((h) => hanokCollider(h.position[0], h.position[2], h.rotation)),
  ...TREES.map(
    (t): Collider => ({ kind: "circle", x: t.position[0], z: t.position[2], r: 0.42 * t.scale }),
  ),
  ...LANTERNS.map((l): Collider => ({ kind: "circle", x: l[0], z: l[1], r: 0.22 })),
  ...BILLBOARDS.map(
    (b): Collider => ({
      kind: "box",
      x: b.position[0],
      z: b.position[2],
      hw: 1.25,
      hd: 0.16,
      rot: b.rotation,
    }),
  ),
  // 모닥불 돌 화덕 (X로 앉는 거리 3.2보다 한참 안쪽이라 상호작용은 막지 않는다)
  { kind: "circle", x: CAMPFIRE_POS[0], z: CAMPFIRE_POS[2], r: 0.95 },
  // 포털 기둥 둘 + 디딤돌
  { kind: "box", x: PORTAL_POS[0] - 2.6, z: PORTAL_POS[2], hw: 0.3, hd: 0.3, rot: 0 },
  { kind: "box", x: PORTAL_POS[0] + 2.6, z: PORTAL_POS[2], hw: 0.3, hd: 0.3, rot: 0 },
];

/**
 * 생겼다 사라지는 것들 — 노점·도깨비는 그리는 쪽이 등록하고 사라질 때 지운다.
 * 없는 것에 부딪히는 것만큼 이상한 것이 없어서 렌더와 수명을 붙여 둔다.
 */
const dynamic = new Map<string, Collider[]>();

export function setDynamicColliders(key: string, list: Collider[] | null): void {
  if (list && list.length) dynamic.set(key, list);
  else dynamic.delete(key);
}

function push(p: { x: number; z: number }, c: Collider, radius: number): void {
  if (c.kind === "circle") {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = c.r + radius;
    if (d >= min) return;
    if (d < 1e-4) {
      // 정확히 한가운데 — 방향이 없으니 아무 쪽으로나 뱉어낸다
      p.x = c.x + min;
      return;
    }
    p.x = c.x + (dx / d) * min;
    p.z = c.z + (dz / d) * min;
    return;
  }
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const dx = p.x - c.x;
  const dz = p.z - c.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ox = c.hw + radius - Math.abs(lx);
  const oz = c.hd + radius - Math.abs(lz);
  if (ox <= 0 || oz <= 0) return;
  // 얕게 파고든 축으로만 밀어낸다 — 벽을 따라 미끄러지는 느낌이 여기서 나온다
  let nx = lx;
  let nz = lz;
  if (ox < oz) nx = (lx < 0 ? -1 : 1) * (c.hw + radius);
  else nz = (lz < 0 ? -1 : 1) * (c.hd + radius);
  p.x = c.x + nx * cos + nz * sin;
  p.z = c.z + (-nx * sin + nz * cos);
}

/**
 * 움직인 뒤에 한 번 부른다. 겹친 만큼만 밖으로 밀어내므로 벽에 비스듬히
 * 들어가면 저절로 미끄러진다 — 따로 미끄럼 계산을 하지 않는 이유다.
 * 좌표를 제자리에서 고친다(매 프레임 도는 코드라 객체를 새로 만들지 않는다).
 */
export function collide(p: { x: number; z: number }, radius = PLAYER_R): void {
  for (const c of VILLAGE_COLLIDERS) push(p, c, radius);
  for (const list of dynamic.values()) for (const c of list) push(p, c, radius);
  // 마을 밖으로는 못 나간다
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_RADIUS) {
    p.x = (p.x / d) * WORLD_RADIUS;
    p.z = (p.z / d) * WORLD_RADIUS;
  }
}

/** 어떤 콜라이더 안에 들어가 있는가 — 테스트와 배치 점검용 */
export function insideAny(x: number, z: number, radius = 0): boolean {
  const p = { x, z };
  collide(p, radius);
  return Math.abs(p.x - x) > 1e-6 || Math.abs(p.z - z) > 1e-6;
}
