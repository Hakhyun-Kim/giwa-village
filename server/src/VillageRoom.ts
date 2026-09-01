import { Room, Client } from "@colyseus/core";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GuildRegistry, GUILD_EMBLEMS, MAX_FLOOR } from "./guilds";

export interface PlayerState {
  id: string;
  name: string;
  address: string;
  color: number;
  x: number;
  z: number;
  rot: number;
}

export interface StallItem {
  id: string;
  name: string;
  emoji: string;
  priceEth: string;
}

export interface Stall {
  id: string;
  ownerAddress: string;
  ownerName: string;
  title: string;
  tag?: string;
  x: number;
  z: number;
  items: StallItem[];
  brand?: boolean;
  theme?: string;
  createdAt: number;
}

const WORLD_RADIUS = 55;
const SNAPSHOT_HZ = 15;
// zombie sockets (e.g. bfcache'd pages) answer TCP pings but never send
// app-level heartbeats — reap them after this window
const HEARTBEAT_TIMEOUT_MS = 120_000;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = path.resolve(ROOT, "server", "data");
const STALLS_FILE = path.resolve(DATA_DIR, "stalls.json");
const WALLETS_FILE = path.resolve(ROOT, ".testwallets.json");

// fictional brands only — real brand names need partnerships (roadmap Phase 3+)
const BRAND_SEEDS = [
  {
    theme: "pizza",
    title: "화덕피자공방",
    tag: "만원 할인",
    x: 16,
    z: -5,
    items: [
      { name: "만원 할인쿠폰", emoji: "🍕", priceEth: "0.002" },
      { name: "조각피자 교환권", emoji: "🍕", priceEth: "0.001" },
    ],
  },
  {
    theme: "cvs",
    title: "달빛편의점",
    tag: "24시간 영업",
    x: 21,
    z: 5,
    items: [
      { name: "삼각김밥 교환권", emoji: "🍙", priceEth: "0.0005" },
      { name: "아이스크림 교환권", emoji: "🍦", priceEth: "0.0005" },
    ],
  },
  {
    theme: "burger",
    title: "번개버거",
    tag: "30분 배달",
    x: 27,
    z: -5,
    items: [{ name: "버거세트 배달쿠폰", emoji: "🍔", priceEth: "0.001" }],
  },
];

/** live occupant list for the /dev/status endpoint */
export const liveRoster = new Map<
  string,
  { name: string; address: string; joinedAt: number }
>();

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function sanitizeName(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16);
}

function sanitizeText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.replace(/[<>]/g, "").trim().slice(0, max);
}

function isPrice(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d+(\.\d{1,18})?$/.test(v) &&
    Number(v) > 0 &&
    Number(v) <= 1
  );
}

function isTxHash(v: unknown): v is string {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

function systemAddress(): string {
  // 호스팅 환경: 브랜드 상점 정산 수신 주소를 env로 지정 (테스트 지갑 파일이 없음)
  const env = process.env.SYSTEM_WALLET_ADDRESS;
  if (env && /^0x[0-9a-fA-F]{40}$/.test(env)) return env;
  try {
    const wallets = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
    const d = wallets.find((w: { slot: string }) => w.slot === "D");
    if (d?.address) return d.address;
  } catch {}
  return "0x000000000000000000000000000000000000dEaD";
}

export class VillageRoom extends Room {
  maxClients = 60;
  private players = new Map<string, PlayerState>();
  private lastSeen = new Map<string, number>();
  private stalls = new Map<string, Stall>(); // keyed by stall id
  private guilds = new GuildRegistry(path.resolve(DATA_DIR, "guilds.json"));
  // 진행 중인 던전 원정 (세션별 잠정 층수 + 원정 회차)
  private runs = new Map<
    string,
    { guildId: string; tentative: number; attempt: number }
  >();

  private touch(sessionId: string) {
    this.lastSeen.set(sessionId, Date.now());
  }

  private loadStalls() {
    try {
      const list: Stall[] = JSON.parse(fs.readFileSync(STALLS_FILE, "utf8"));
      for (const s of list) this.stalls.set(s.id, s);
    } catch {}
    // seed fictional brand shops once
    const sysAddr = systemAddress();
    for (const seed of BRAND_SEEDS) {
      const id = `brand-${seed.theme}`;
      if (!this.stalls.has(id)) {
        this.stalls.set(id, {
          id,
          ownerAddress: sysAddr,
          ownerName: seed.title,
          title: seed.title,
          tag: seed.tag,
          x: seed.x,
          z: seed.z,
          items: seed.items.map((it, i) => ({ ...it, id: `${id}-${i}` })),
          brand: true,
          theme: seed.theme,
          createdAt: Date.now(),
        });
      }
    }
    this.saveStalls();
  }

  private saveStalls() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(
        STALLS_FILE,
        JSON.stringify([...this.stalls.values()], null, 2),
        "utf8",
      );
    } catch (err) {
      console.error("[stalls] save failed:", err);
    }
  }

  private stallList(): Stall[] {
    return [...this.stalls.values()];
  }

  onCreate() {
    this.loadStalls();

    this.onMessage("ping", (client) => this.touch(client.sessionId));

    this.onMessage("move", (client, data: unknown) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p || typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      p.x = clamp(num(d.x, p.x), -WORLD_RADIUS, WORLD_RADIUS);
      p.z = clamp(num(d.z, p.z), -WORLD_RADIUS, WORLD_RADIUS);
      p.rot = num(d.rot, p.rot);
    });

    this.onMessage("emote", (client, emote: unknown) => {
      this.touch(client.sessionId);
      if (typeof emote !== "string") return;
      this.broadcast("emote", {
        id: client.sessionId,
        emote: emote.slice(0, 8),
      });
    });

    // client-confirmed on-chain gift; relay for the shared feed.
    // amount/tx are display-only — never trusted for balances (chain is source of truth).
    this.onMessage("gift", (client, data: unknown) => {
      this.touch(client.sessionId);
      if (typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      const sender = this.players.get(client.sessionId);
      const to = typeof d.to === "string" ? d.to : "";
      const recipient = this.players.get(to);
      if (!sender || !recipient) return;
      if (!isTxHash(d.tx)) return;
      const amountEth = typeof d.amountEth === "string" ? d.amountEth.slice(0, 24) : "";
      this.broadcast("gift", {
        kind: "gift",
        from: client.sessionId,
        fromName: sender.name,
        to,
        toName: recipient.name,
        amountEth,
        tx: d.tx,
        at: Date.now(),
      });
    });

    // ---- stalls ----

    this.onMessage("stalls:get", (client) => {
      this.touch(client.sessionId);
      client.send("stalls", this.stallList());
    });

    this.onMessage("stall:open", (client, data: unknown) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p?.address || typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      const title = sanitizeText(d.title, 20);
      if (!title) return;
      if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 3) return;

      const id = `s-${p.address.slice(2, 10).toLowerCase()}`;
      const items: StallItem[] = [];
      for (let i = 0; i < d.items.length; i++) {
        const raw = d.items[i] as Record<string, unknown>;
        const name = sanitizeText(raw?.name, 16);
        const emoji = sanitizeText(raw?.emoji, 4) || "🎁";
        if (!name || !isPrice(raw?.priceEth)) return;
        items.push({ id: `${id}-${i}`, name, emoji, priceEth: raw.priceEth });
      }

      this.stalls.set(id, {
        id,
        ownerAddress: p.address,
        ownerName: p.name,
        title,
        x: clamp(p.x, -50, 50),
        z: clamp(p.z, -50, 50),
        items,
        createdAt: Date.now(),
      });
      this.saveStalls();
      this.broadcast("stalls", this.stallList());
      console.log(`[stall] open "${title}" by ${p.name}`);
    });

    this.onMessage("stall:close", (client) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p?.address) return;
      const id = `s-${p.address.slice(2, 10).toLowerCase()}`;
      if (this.stalls.delete(id)) {
        this.saveStalls();
        this.broadcast("stalls", this.stallList());
        console.log(`[stall] close by ${p.name}`);
      }
    });

    this.onMessage("stall:buy", (client, data: unknown) => {
      this.touch(client.sessionId);
      const buyer = this.players.get(client.sessionId);
      if (!buyer || typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      const stall = typeof d.stallId === "string" ? this.stalls.get(d.stallId) : undefined;
      if (!stall || !isTxHash(d.tx)) return;
      const item = stall.items.find((it) => it.id === d.itemId);
      if (!item) return;
      this.broadcast("stall:sale", {
        kind: "sale",
        stallId: stall.id,
        stallTitle: stall.title,
        itemName: item.name,
        itemEmoji: item.emoji,
        priceEth: item.priceEth,
        buyer: client.sessionId,
        buyerName: buyer.name,
        buyerAddress: buyer.address,
        ownerName: stall.ownerName,
        tx: d.tx,
        at: Date.now(),
      });
      console.log(`[sale] ${buyer.name} bought ${item.name} @ ${stall.title}`);
    });

    // ---- 길드 + 비동기 코업 던전 ----

    const broadcastGuilds = () => this.broadcast("guilds", this.guilds.list());

    this.onMessage("guilds:get", (client) => {
      this.touch(client.sessionId);
      client.send("guilds", this.guilds.list());
    });

    this.onMessage("guild:create", (client, data: unknown) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p?.address || typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      const name = sanitizeText(d.name, 12);
      const emblem = typeof d.emblem === "string" ? d.emblem : GUILD_EMBLEMS[0];
      const result = this.guilds.create(
        { address: p.address, name: p.name },
        name,
        emblem,
      );
      if (typeof result === "string") {
        client.send("guild:error", result);
        return;
      }
      console.log(`[guild] create "${result.name}" by ${p.name}`);
      broadcastGuilds();
    });

    this.onMessage("guild:join", (client, data: unknown) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p?.address || typeof data !== "object" || data === null) return;
      const d = data as Record<string, unknown>;
      const result = this.guilds.join(
        { address: p.address, name: p.name },
        typeof d.guildId === "string" ? d.guildId : "",
      );
      if (typeof result === "string") {
        client.send("guild:error", result);
        return;
      }
      console.log(`[guild] ${p.name} joined "${result.name}"`);
      broadcastGuilds();
    });

    this.onMessage("guild:leave", (client) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!p?.address) return;
      this.runs.delete(client.sessionId);
      if (this.guilds.leave(p.address)) broadcastGuilds();
    });

    this.onMessage("dungeon:enter", async (client) => {
      this.touch(client.sessionId);
      const p = this.players.get(client.sessionId);
      const begun = p?.address ? this.guilds.beginRun(p.address) : undefined;
      if (!p || !begun) {
        client.send("guild:error", "던전은 길드 원정입니다 — 먼저 길드에 가입하세요.");
        return;
      }
      const { guild, attempt } = begun;
      const seed = await this.guilds.seedFor(this.guilds.currentEpoch());
      this.runs.set(client.sessionId, { guildId: guild.id, tentative: 0, attempt });
      client.send("dungeon:state", {
        guildId: guild.id,
        guildName: guild.name,
        emblem: guild.emblem,
        epoch: seed.epoch,
        seedBlock: seed.seedBlock,
        seedHash: seed.seedHash,
        offchain: !!seed.offchain,
        floor: guild.dungeon.floor,
        tentative: 0,
        attempt,
      });
    });

    this.onMessage("dungeon:pick", async (client, data: unknown) => {
      this.touch(client.sessionId);
      const run = this.runs.get(client.sessionId);
      const p = this.players.get(client.sessionId);
      const guild = p?.address ? this.guilds.byMember(p.address) : undefined;
      if (!run || !guild || guild.id !== run.guildId) return;
      const d = (data ?? {}) as Record<string, unknown>;
      const door = num(d.door, -1);
      if (door < 0 || door > 2) return;
      const seed = await this.guilds.seedFor(this.guilds.currentEpoch());
      const floor = Math.min(MAX_FLOOR, guild.dungeon.floor + run.tentative);
      const outcome = this.guilds.doorOutcome(
        seed.seedHash,
        guild.id,
        run.attempt,
        floor,
        door,
      );
      if (outcome === "safe") run.tentative += 1;
      else if (outcome === "bonus") run.tentative += 2;
      const ended = outcome === "trap";
      client.send("dungeon:result", {
        outcome,
        door,
        tentative: ended ? 0 : run.tentative,
        floor: guild.dungeon.floor,
        ended,
      });
      if (ended) this.runs.delete(client.sessionId);
    });

    this.onMessage("dungeon:bank", (client) => {
      this.touch(client.sessionId);
      const run = this.runs.get(client.sessionId);
      const p = this.players.get(client.sessionId);
      if (!run || !p?.address || run.tentative <= 0) return;
      const g = this.guilds.bank(p.address, run.tentative);
      this.runs.delete(client.sessionId);
      if (!g) return;
      client.send("dungeon:banked", {
        floors: run.tentative,
        floor: g.dungeon.floor,
      });
      console.log(
        `[dungeon] ${p.name} banked +${run.tentative}층 → ${g.name} ${g.dungeon.floor}층`,
      );
      broadcastGuilds();
    });

    this.setSimulationInterval(() => {
      this.broadcast("snapshot", [...this.players.values()]);
    }, 1000 / SNAPSHOT_HZ);

    this.clock.setInterval(() => this.reapIdle(), 30_000);
  }

  private reapIdle() {
    const now = Date.now();
    for (const [id, seen] of this.lastSeen) {
      if (now - seen <= HEARTBEAT_TIMEOUT_MS) continue;
      const client = this.clients.find((c) => c.sessionId === id);
      if (client) {
        console.log(`[reap] idle client ${this.players.get(id)?.name ?? id}`);
        client.leave();
      } else {
        this.lastSeen.delete(id);
      }
    }
  }

  onJoin(client: Client, options: Record<string, unknown> | undefined) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 3 + Math.random() * 4;

    let name =
      sanitizeName(options?.name) || `guest-${client.sessionId.slice(0, 4)}`;
    // dedupe: two 주민s with the same name confuse playtests
    const taken = new Set([...this.players.values()].map((p) => p.name));
    if (taken.has(name)) {
      let i = 2;
      while (taken.has(`${name}${i}`)) i++;
      name = `${name}${i}`;
    }

    const player: PlayerState = {
      id: client.sessionId,
      name,
      address:
        typeof options?.address === "string"
          ? options.address.slice(0, 42)
          : "",
      color: num(options?.color, Math.floor(Math.random() * 0xffffff)),
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      rot: 0,
    };
    this.players.set(client.sessionId, player);
    this.touch(client.sessionId);
    liveRoster.set(client.sessionId, {
      name: player.name,
      address: player.address,
      joinedAt: Date.now(),
    });
    console.log(`[join] ${player.name} (${this.players.size} online)`);
  }

  onLeave(client: Client) {
    const p = this.players.get(client.sessionId);
    this.players.delete(client.sessionId);
    this.lastSeen.delete(client.sessionId);
    this.runs.delete(client.sessionId);
    liveRoster.delete(client.sessionId);
    this.broadcast("leave", client.sessionId);
    console.log(`[leave] ${p?.name ?? client.sessionId} (${this.players.size} online)`);
  }
}
