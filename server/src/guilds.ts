import crypto from "crypto";
import fs from "fs";
import path from "path";

// ---- 길드 + 비동기 코업 던전 ----
// 던전 시드는 주차(에포크)마다 GIWA 블록 해시로 고정한다: 에포크 첫 조회 시점의
// 최신 블록을 1000 단위로 내림한 블록의 해시를 기록 — 누구나 익스플로러에서
// 같은 시드를 검증할 수 있다. 문(door) 결과는 시드+길드+층+문 번호의 해시로
// 결정되므로 서버가 임의로 바꿀 수 없다.

export interface GuildMember {
  address: string;
  name: string;
}

export interface GuildDungeonState {
  epoch: number;
  floor: number; // 이번 주 확정(banked) 층
  best: number; // 역대 최고층
  runs: number; // 귀환(층수 확정)까지 간 원정 횟수
  attempts: number; // 총 입장 횟수 — 문 결과 해시에 섞여 매 원정 맵이 달라진다
}

export interface Guild {
  id: string;
  name: string;
  emblem: string;
  founderAddress: string;
  createdAt: number;
  members: GuildMember[];
  dungeon: GuildDungeonState;
}

export interface DungeonSeed {
  epoch: number;
  seedBlock: number;
  seedHash: string;
  /** RPC 실패 시 오프체인 폴백 시드 여부 */
  offchain?: boolean;
}

export type DoorOutcome = "safe" | "bonus" | "trap";

export const MAX_FLOOR = 100;
export const GUILD_EMBLEMS = ["🏯", "🐯", "🐉", "🌸", "⚔️", "🍶", "🎏", "🐢"];
const EPOCH_MS = 7 * 24 * 3600 * 1000;
const RPC_URL = process.env.GIWA_RPC ?? "https://sepolia-rpc.giwa.io";

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(5000),
  });
  const body = (await res.json()) as { result?: unknown };
  return body.result;
}

export class GuildRegistry {
  private guilds = new Map<string, Guild>();
  private seeds = new Map<number, DungeonSeed>();
  private seedPromise: Promise<DungeonSeed> | null = null;

  constructor(private file: string) {
    this.load();
  }

  private load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const g of raw.guilds ?? []) this.guilds.set(g.id, g);
      for (const s of raw.seeds ?? []) this.seeds.set(s.epoch, s);
    } catch {}
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(
        this.file,
        JSON.stringify(
          { guilds: [...this.guilds.values()], seeds: [...this.seeds.values()] },
          null,
          2,
        ),
        "utf8",
      );
    } catch (err) {
      console.error("[guilds] save failed:", err);
    }
  }

  currentEpoch(): number {
    return Math.floor(Date.now() / EPOCH_MS);
  }

  /** 주차가 바뀌면 이번 주 층수를 리셋한다 (최고 기록은 유지) */
  private rollover(g: Guild) {
    const epoch = this.currentEpoch();
    if (g.dungeon.epoch !== epoch) {
      g.dungeon.epoch = epoch;
      g.dungeon.floor = 0;
    }
  }

  list(): Guild[] {
    const out = [...this.guilds.values()];
    for (const g of out) this.rollover(g);
    // 리더보드 순서: 이번 주 층수 → 최고층 → 창설 순
    out.sort(
      (a, b) =>
        b.dungeon.floor - a.dungeon.floor ||
        b.dungeon.best - a.dungeon.best ||
        a.createdAt - b.createdAt,
    );
    return out;
  }

  byMember(address: string): Guild | undefined {
    const a = address.toLowerCase();
    for (const g of this.guilds.values()) {
      if (g.members.some((m) => m.address.toLowerCase() === a)) return g;
    }
    return undefined;
  }

  create(founder: GuildMember, name: string, emblem: string): Guild | string {
    if (!founder.address) return "지갑이 있어야 길드를 만들 수 있습니다.";
    if (this.byMember(founder.address)) return "이미 가입한 길드가 있습니다.";
    if (!name) return "길드 이름을 입력하세요.";
    if (!GUILD_EMBLEMS.includes(emblem)) return "문장을 선택하세요.";
    for (const g of this.guilds.values()) {
      if (g.name === name) return "같은 이름의 길드가 있습니다.";
    }
    const id = `g-${crypto.randomBytes(4).toString("hex")}`;
    const guild: Guild = {
      id,
      name,
      emblem,
      founderAddress: founder.address,
      createdAt: Date.now(),
      members: [founder],
      dungeon: {
        epoch: this.currentEpoch(),
        floor: 0,
        best: 0,
        runs: 0,
        attempts: 0,
      },
    };
    this.guilds.set(id, guild);
    this.save();
    return guild;
  }

  join(member: GuildMember, guildId: string): Guild | string {
    if (!member.address) return "지갑이 있어야 길드에 가입할 수 있습니다.";
    if (this.byMember(member.address)) return "이미 가입한 길드가 있습니다.";
    const g = this.guilds.get(guildId);
    if (!g) return "길드를 찾을 수 없습니다.";
    if (g.members.length >= 20) return "길드 정원이 가득 찼습니다.";
    g.members.push(member);
    this.save();
    return g;
  }

  leave(address: string): Guild | undefined {
    const g = this.byMember(address);
    if (!g) return undefined;
    const a = address.toLowerCase();
    g.members = g.members.filter((m) => m.address.toLowerCase() !== a);
    if (g.members.length === 0) this.guilds.delete(g.id);
    this.save();
    return g;
  }

  /** 이번 에포크의 온체인 시드 — 최초 조회 시 GIWA 블록 해시로 고정·영속 */
  async seedFor(epoch: number): Promise<DungeonSeed> {
    const cached = this.seeds.get(epoch);
    if (cached) return cached;
    if (this.seedPromise) return this.seedPromise;
    this.seedPromise = (async () => {
      let seed: DungeonSeed;
      try {
        const latestHex = (await rpc("eth_blockNumber", [])) as string;
        const latest = parseInt(latestHex, 16);
        const seedBlock = latest - (latest % 1000);
        const block = (await rpc("eth_getBlockByNumber", [
          `0x${seedBlock.toString(16)}`,
          false,
        ])) as { hash?: string } | null;
        if (!block?.hash) throw new Error("no block hash");
        seed = { epoch, seedBlock, seedHash: block.hash };
      } catch (err) {
        console.warn("[dungeon] 온체인 시드 조회 실패 — 오프체인 폴백:", err);
        seed = {
          epoch,
          seedBlock: 0,
          seedHash:
            "0x" +
            crypto.createHash("sha256").update(`giwa-dungeon-${epoch}`).digest("hex"),
          offchain: true,
        };
      }
      this.seeds.set(epoch, seed);
      this.save();
      this.seedPromise = null;
      return seed;
    })();
    return this.seedPromise;
  }

  /** 새 원정 시작 — 입장 회차를 올려 이번 원정의 맵을 확정한다 */
  beginRun(address: string): { guild: Guild; attempt: number } | undefined {
    const g = this.byMember(address);
    if (!g) return undefined;
    this.rollover(g);
    g.dungeon.attempts = (g.dungeon.attempts ?? 0) + 1;
    this.save();
    return { guild: g, attempt: g.dungeon.attempts };
  }

  /**
   * 문 결과: 시드·길드·원정 회차·층·문 번호로 결정
   * (60% 전진, 15% 순풍 +2, 25% 함정). 회차가 섞이므로 재입장해서 함정
   * 위치를 외우는 것이 불가능하고, 회차가 기록되므로 사후 검증은 가능하다.
   */
  doorOutcome(
    seedHash: string,
    guildId: string,
    attempt: number,
    floor: number,
    door: number,
  ): DoorOutcome {
    const digest = crypto
      .createHash("sha256")
      .update(`${seedHash}:${guildId}:${attempt}:${floor}:${door}`)
      .digest();
    const roll = digest[0];
    if (roll < 154) return "safe"; // 154/256 ≈ 60%
    if (roll < 192) return "bonus"; // 38/256 ≈ 15%
    return "trap"; // 64/256 = 25%
  }

  /** 원정 수확 확정 — 길드 층수에 누적 */
  bank(address: string, floors: number): Guild | undefined {
    const g = this.byMember(address);
    if (!g || floors <= 0) return g;
    this.rollover(g);
    g.dungeon.floor = Math.min(MAX_FLOOR, g.dungeon.floor + floors);
    g.dungeon.best = Math.max(g.dungeon.best, g.dungeon.floor);
    g.dungeon.runs += 1;
    this.save();
    return g;
  }
}
