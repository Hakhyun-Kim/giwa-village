// 서버 판정과 클라이언트 예측·표시가 공유하는 실시간 원정 규칙. 자산/체인 쓰기 없음.
export const ARENA_RADIUS = 18;
export const WALK_SPEED = 6;
export const ATTACK_RANGE = 3.4;
export const ATTACK_COOLDOWN = 650;
export const SKILL_COOLDOWN = 5000;
export const MAX_PARTY = 4;
export type Zone = "village" | "field" | "dungeon";
export type CombatAction = "attack" | "skill";
export interface Fighter {
  id: string; name: string; color: number; x: number; z: number; rot: number;
  hp: number; maxHp: number; attackAt: number; skillAt: number;
  dx: number; dz: number; inputAt: number; joinedAt: number;
}
export interface Enemy {
  id: string; name: string; x: number; z: number; hp: number; maxHp: number;
  boss: boolean; nextAttack: number;
  warning: { x: number; z: number; radius: number; hitAt: number } | null;
}
export interface CombatEvent { id: number; x: number; z: number; amount: number; kind: "hit" | "hurt" | "skill" }
export interface ExpeditionState {
  now: number; phase: "guards" | "boss" | "victory" | "defeat";
  players: Fighter[]; enemies: Enemy[]; events: CombatEvent[];
  guide: { x: number; z: number; nextAttack: number };
}
export function createExpedition(now = 0): ExpeditionState {
  return { now, phase: "guards", players: [], events: [], guide: { x: -2, z: 9, nextAttack: now + 1800 },
    enemies: [-5, 5].map((x, i) => ({ id: `guard-${i}`, name: "숲 도깨비", x, z: -3,
      hp: 90, maxHp: 90, boss: false, nextAttack: now + 2000, warning: null })) };
}
export function addFighter(s: ExpeditionState, id: string, name: string, color: number): Fighter | null {
  if (s.players.length >= MAX_PARTY || s.phase === "victory" || s.phase === "defeat") return null;
  const p: Fighter = { id, name, color, x: (s.players.length - 1) * 1.5, z: 10, rot: Math.PI,
    hp: 100, maxHp: 100, attackAt: 0, skillAt: 0, dx: 0, dz: 0, inputAt: s.now, joinedAt: s.now };
  s.players.push(p); return p;
}
export function setInput(s: ExpeditionState, id: string, value: unknown): void {
  const p = s.players.find(p => p.id === id);
  if (!p || !value || typeof value !== "object") return;
  const d = value as Record<string, unknown>;
  if (typeof d.x !== "number" || typeof d.z !== "number" || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
  const len = Math.max(1, Math.hypot(d.x, d.z));
  p.dx = d.x / len; p.dz = d.z / len; p.inputAt = s.now;
}
function effect(s: ExpeditionState, x: number, z: number, amount: number, kind: CombatEvent["kind"]) {
  s.events.push({ id: (s.events.at(-1)?.id ?? 0) + 1, x, z, amount, kind });
  if (s.events.length > 24) s.events.shift();
}
export function act(s: ExpeditionState, id: string, action: unknown): boolean {
  if (s.phase === "victory" || s.phase === "defeat") return false;
  const p = s.players.find(p => p.id === id);
  if (!p || p.hp <= 0 || (action !== "attack" && action !== "skill")) return false;
  const skill = action === "skill";
  if (s.now < p.attackAt || (skill && s.now < p.skillAt)) return false;
  const targets = s.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - p.x, e.z - p.z) <= (skill ? 5 : ATTACK_RANGE))
    .sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  if (!targets.length) return false;
  p.attackAt = s.now + ATTACK_COOLDOWN;
  if (skill) p.skillAt = s.now + SKILL_COOLDOWN;
  for (const e of skill ? targets : targets.slice(0, 1)) {
    const amount = Math.min(e.hp, skill ? 35 : 18); e.hp -= amount;
    p.rot = Math.atan2(e.x - p.x, e.z - p.z);
    effect(s, e.x, e.z, amount, skill ? "skill" : "hit");
  }
  return true;
}
export function clampArena(p: { x: number; z: number }): void {
  p.x = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, p.x));
  p.z = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, p.z));
}
function approach(p: { x: number; z: number }, x: number, z: number, distance: number) {
  const dx = x - p.x, dz = z - p.z, len = Math.hypot(dx, dz);
  if (len > 0.01) { p.x += dx / len * Math.min(distance, len); p.z += dz / len * Math.min(distance, len); }
}
export function tickExpedition(s: ExpeditionState, elapsedMs: number): void {
  const ms = Math.max(0, Math.min(100, elapsedMs)); s.now += ms;
  if (s.phase === "victory" || s.phase === "defeat" || !s.players.length) return;
  for (const p of s.players) {
    if (p.hp <= 0 || s.now - p.inputAt > 350) continue;
    p.x += p.dx * WALK_SPEED * ms / 1000; p.z += p.dz * WALK_SPEED * ms / 1000;
    if (Math.hypot(p.dx, p.dz) > .05) p.rot = Math.atan2(p.dx, p.dz);
    clampArena(p);
  }
  const alive = s.players.filter(p => p.hp > 0);
  if (!alive.length) { s.phase = "defeat"; return; }
  if (s.enemies.every(e => e.hp <= 0)) {
    if (s.phase === "boss") { s.phase = "victory"; return; }
    s.phase = "boss";
    s.enemies = [{ id: "forest-chief", name: "산채 도깨비 대장", x: 0, z: -9,
      hp: 360, maxHp: 360, boss: true, nextAttack: s.now + 2500, warning: null }];
    for (const p of alive) p.hp = Math.min(p.maxHp, p.hp + 25);
  }
  for (const e of s.enemies) {
    if (e.hp <= 0) { e.warning = null; continue; }
    if (e.warning) {
      if (s.now >= e.warning.hitAt) {
        for (const p of alive) if (Math.hypot(p.x - e.warning.x, p.z - e.warning.z) <= e.warning.radius) {
          const amount = Math.min(p.hp, e.boss ? 28 : 14); p.hp -= amount;
          effect(s, p.x, p.z, amount, "hurt");
        }
        e.warning = null; e.nextAttack = s.now + (e.boss ? 1700 : 2200);
      }
      continue;
    }
    const target = [...alive].sort((a, b) => Math.hypot(a.x-e.x,a.z-e.z)-Math.hypot(b.x-e.x,b.z-e.z))[0];
    if (Math.hypot(target.x-e.x,target.z-e.z) > 2.5) approach(e, target.x, target.z, (e.boss ? 2.3 : 2.8)*ms/1000);
    if (s.now >= e.nextAttack && Math.hypot(target.x-e.x,target.z-e.z) < 6) {
      e.warning = { x: target.x, z: target.z, radius: e.boss ? 3.8 : 2.5, hitAt: s.now + (e.boss ? 1300 : 1000) };
    }
  }
  // 교관은 한 명만 돕는다. 부활/보상은 만들지 않고 체험의 빈자리를 채운다.
  const target = s.enemies.find(e => e.hp > 0);
  if (target) {
    approach(s.guide, target.x - 2, target.z + 1, 4 * ms / 1000);
    if (s.now >= s.guide.nextAttack && Math.hypot(s.guide.x-target.x,s.guide.z-target.z) < 4) {
      const amount = Math.min(6, target.hp); target.hp -= amount;
      effect(s, target.x, target.z, amount, "hit"); s.guide.nextAttack = s.now + 1800;
    }
  }
}
