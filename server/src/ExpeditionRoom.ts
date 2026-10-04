import { Room, Client } from "@colyseus/core";
import { addFighter, act, createExpedition, MAX_PARTY, setInput, tickExpedition } from "../../shared/expedition";

/** 동의 없이 끊긴 대원(소켓이 끊겼거나 15초 무입력으로 내보낸 사람)의 자리를 지키는 시간 — PROTOCOL.md §3.7 */
const RECONNECT_SECONDS = 20;

/** 한 룸 = 한 원정. 자산·지갑·온체인 보상을 다루지 않는 서버 권위 전투. */
export class ExpeditionRoom extends Room {
  maxClients = MAX_PARTY;
  private combat = createExpedition();
  private seen = new Map<string, number>();
  private finished = false;
  onCreate() {
    this.setPrivate(true); // 초대 코드(roomId)로만 합류
    this.onMessage("ready", c => { this.seen.set(c.sessionId, this.combat.now); c.send("combat", this.combat); });
    this.onMessage("input", (c, input) => {
      this.seen.set(c.sessionId, this.combat.now); setInput(this.combat, c.sessionId, input);
    });
    this.onMessage("action", (c, action) => act(this.combat, c.sessionId, action));
    this.setSimulationInterval(dt => {
      tickExpedition(this.combat, dt);
      for (const c of this.clients) if (this.combat.now - (this.seen.get(c.sessionId) ?? 0) > 15000) void c.leave();
      if (!this.finished && (this.combat.phase === "victory" || this.combat.phase === "defeat")) { this.finished=true; void this.lock(); }
      this.broadcast("combat", this.combat);
    }, 50);
  }
  onJoin(client: Client, options: { name?: unknown; color?: unknown } = {}) {
    const name = typeof options.name === "string" ? options.name.replace(/[<>]/g, "").slice(0,16) : "원정대원";
    const color = typeof options.color === "number" && Number.isFinite(options.color) ? options.color & 0xffffff : 0x61bfb4;
    if (!addFighter(this.combat, client.sessionId, name, color)) { void client.leave(4000); return; }
    this.seen.set(client.sessionId, this.combat.now);
  }
  async onLeave(client: Client, consented?: boolean) {
    // 휴대폰이 잠깐 뒤로 갔다 와도 같은 대원으로 이어지게 — 스스로 나갔거나 끝난 원정은 기다리지 않는다
    if (!consented && !this.finished) {
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        this.seen.set(client.sessionId, this.combat.now);
        return;
      } catch { /* 시간 안에 돌아오지 않았다 */ }
    }
    this.seen.delete(client.sessionId);
    this.combat.players = this.combat.players.filter(p => p.id !== client.sessionId);
  }
}
