// 마을 주민 페르소나 — data/npcs.json 하나를 클라이언트와 상인 봇이 같이 읽는다.
// (봇 쪽 소비는 scripts/merchant-bot.mjs)
import npcsJson from "../../../data/npcs.json";

export interface Persona {
  id: string;
  name: string;
  class: "merchant" | "villager";
  address: string;
  home: [number, number];
  /** 노점 간판 (상인만) */
  stall?: string;
  /** 이 인물이 어떤 사람인지 — 봇의 LLM 프롬프트로도 쓰인다 */
  persona: string;
  /** 정가 대비 받아 줄 수 있는 최저 비율 (상인만, 봇에서 코드로 강제) */
  floorRatio?: number;
  /** 마을에서 가끔 흘리는 혼잣말 */
  lines: string[];
}

interface NpcsFile {
  templates: Record<string, { label: string; rules: string[] }>;
  npcs: (Omit<Persona, "home"> & { home: number[]; walletIndex: number })[];
}

const file = npcsJson as unknown as NpcsFile;

export const PERSONAS: Persona[] = file.npcs.map((n) => ({
  id: n.id,
  name: n.name,
  class: n.class,
  address: n.address,
  home: [n.home[0], n.home[1]],
  stall: n.stall,
  persona: n.persona,
  floorRatio: n.floorRatio,
  lines: n.lines,
}));

export function randomLine(p: Persona): string {
  return p.lines[Math.floor(Math.random() * p.lines.length)];
}
