import { Room, Client } from "@colyseus/core";
import { randomUUID } from "node:crypto";
import { verifyMessage } from "viem";

const EMOTE_GAP_MS = 1000;

interface Peer { id: string; name: string; color: number; address: string; x: number; z: number; rot: number; zone: string; primary: boolean }
/** 영구 기록을 소유하지 않는 위치·이모트 중계. 기존 village 룸은 레거시 도구용. */
export class LiveRoom extends Room {
  maxClients = 30;
  private peers = new Map<string, Peer>();
  private seen = new Map<string, number>();
  private challenges = new Map<string, { message: string; at: number }>();
  /** 이모트 속도 제한 — 세션마다 EMOTE_GAP_MS 에 하나. 넘치는 것은 조용히 버린다 */
  private lastEmote = new Map<string, number>();
  onCreate() {
    this.onMessage("ready", c => {
      c.send("snapshot", [...this.peers.values()].filter(p=>p.primary));
      c.send("challenge", this.challenges.get(c.sessionId)?.message);
    });
    this.onMessage("identify", async (c, data: unknown) => {
      const challenge = this.challenges.get(c.sessionId);
      this.challenges.delete(c.sessionId);
      if (!challenge || Date.now()-challenge.at > 60000 || !data || typeof data !== "object") return;
      const d = data as { address?: string; signature?: string };
      if (!/^0x[\da-fA-F]{40}$/.test(d.address ?? "") || !/^0x[\da-fA-F]+$/.test(d.signature ?? "") || (d.signature?.length ?? 0) > 2048) return;
      try {
        if (!await verifyMessage({ address: d.address as `0x${string}`, signature: d.signature as `0x${string}`, message: challenge.message })) return;
        const p = this.peers.get(c.sessionId); if (!p) return;
        // 한 주소의 최신 유효 세션만 주소 아바타를 대표한다.
        const address = d.address!.toLowerCase();
        for (const peer of this.peers.values()) if (peer.address === address) peer.primary = false;
        p.address = address;
      } catch { /* 서명 거절/실패 시 방문자 세션으로 유지 */ }
    });
    this.onMessage("move", (c, value: unknown) => {
      this.seen.set(c.sessionId, Date.now());
      const p = this.peers.get(c.sessionId);
      if (!p || !value || typeof value !== "object") return;
      const d = value as Record<string, unknown>;
      if (![d.x,d.z,d.rot].every(v => typeof v === "number" && Number.isFinite(v))) return;
      p.x = Math.max(-55,Math.min(55,d.x as number)); p.z = Math.max(-55,Math.min(55,d.z as number));
      p.rot = (d.rot as number) % (Math.PI*2);
      if (["village","field","dungeon"].includes(d.zone as string)) p.zone = d.zone as string;
    });
    this.onMessage("emote", (c, icon) => {
      if (!["👋","🙇","👏","💃","🍻"].includes(icon)) return;
      const now = Date.now();
      if (now - (this.lastEmote.get(c.sessionId) ?? 0) < EMOTE_GAP_MS) return;
      this.lastEmote.set(c.sessionId, now);
      this.broadcast("emote", { id: c.sessionId, icon });
    });
    this.setSimulationInterval(() => {
      for (const c of this.clients) if (Date.now()-(this.seen.get(c.sessionId) ?? 0)>15000) void c.leave();
      this.broadcast("snapshot", [...this.peers.values()].filter(p=>p.primary));
    }, 1000/15);
  }
  onJoin(c: Client, options: { name?: unknown; color?: unknown } = {}) {
    this.peers.set(c.sessionId, { id:c.sessionId, name:typeof options.name === "string" ? options.name.replace(/[<>]/g,"").slice(0,16) : "방문자",
      color: typeof options.color === "number" ? options.color & 0xffffff : 0x61bfb4,
      address:"", x:0,z:5,rot:0,zone:"village",primary:true });
    this.seen.set(c.sessionId,Date.now());
    this.challenges.set(c.sessionId, { message:`GIWA Village session\n${this.roomId}/${c.sessionId}\n${randomUUID()}`,at:Date.now() });
  }
  onLeave(c: Client) {
    const old=this.peers.get(c.sessionId);
    this.peers.delete(c.sessionId); this.seen.delete(c.sessionId); this.challenges.delete(c.sessionId); this.lastEmote.delete(c.sessionId);
    if(old?.address && old.primary) {
      const next=[...this.peers.values()].reverse().find(p=>p.address===old.address);
      if(next)next.primary=true;
    }
  }
}
