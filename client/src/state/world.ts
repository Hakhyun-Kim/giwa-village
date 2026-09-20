import { create } from "zustand";
import type { ExpeditionState, Zone } from "../../../shared/expedition";
export const FIELD_GATE = { x: 0, z: 13 };
export const CAVE_GATE = { x: 0, z: -16 };
export const VILLAGE_GATE = { x: 8, z: -24 };
export const fieldWalk = { active:false, x:0, z:-13 };
// 20Hz 위치는 React 전역 상태에 넣지 않는다. useFrame이 읽는다.
export let combatSnapshot: ExpeditionState | null = null;
export function setCombatSnapshot(s: ExpeditionState | null) { combatSnapshot = s; }
export const useWorld = create<{
  zone: Zone; server: "connecting" | "online" | "offline";
  entering: boolean; instanceId: string; fighterId: string; notice: string;
}>(() => ({ zone: "village", server: "connecting", entering: false, instanceId: "", fighterId: "", notice: "" }));
export const liveAddresses = new Set<string>();
export const liveTargets = new Map<string, { x: number; z: number; rot: number; name: string; color: number; zone: string }>();
