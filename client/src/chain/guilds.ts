// 길드 + 백층 던전: 목록 동기화·가입·원정 (GiwaGuilds)
// 던전 플레이는 로컬에서 즉시 판정(keccak 재계산)하고 귀환만 온체인 정산한다.
import { decodeEventLog, encodePacked, hexToBytes, keccak256 } from "viem";
import { publicClient, activeWalletClient, queueTx } from "../wallet/wallet";
import { GUILDS_ADDRESS, GUILDS_ABI } from "../config/guilds";
import { useStore } from "../state/store";
import type { Guild } from "../types";

interface ChainGuild {
  name: string;
  emblem: string;
  founder: `0x${string}`;
  createdAt: bigint;
  members: readonly `0x${string}`[];
  d: { epoch: number; floor: number; best: number; runs: number; attempts: number };
}

export async function syncGuilds(): Promise<void> {
  const list = (await publicClient.readContract({
    address: GUILDS_ADDRESS,
    abi: GUILDS_ABI,
    functionName: "allGuilds",
  })) as readonly ChainGuild[];

  const guilds: Guild[] = list.map((g, i) => ({
    id: String(i),
    name: g.name,
    emblem: g.emblem,
    founderAddress: g.founder,
    createdAt: Number(g.createdAt) * 1000,
    members: g.members.map((a) => ({ address: a, name: `나그네-${a.slice(2, 6)}` })),
    dungeon: {
      epoch: g.d.epoch,
      floor: g.d.floor,
      best: g.d.best,
      runs: g.d.runs,
      attempts: g.d.attempts,
    },
  }));
  guilds.sort(
    (a, b) =>
      b.dungeon.floor - a.dungeon.floor ||
      b.dungeon.best - a.dungeon.best ||
      a.createdAt - b.createdAt,
  );
  useStore.getState().setGuilds(guilds);
}

const REVERT_KO: Record<string, string> = {
  member: "이미 가입한 길드가 있습니다.",
  taken: "같은 이름의 길드가 있습니다.",
  full: "길드 정원이 가득 찼습니다.",
  none: "먼저 길드에 가입하세요.",
  runner: "본인이 시작한 원정만 정산할 수 있습니다.",
};

function guildError(err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const short = Object.keys(REVERT_KO).find(
    (k) => msg.includes(`"${k}"`) || msg.includes(`reverted: ${k}`),
  );
  useStore.getState().setGuildError(short ? REVERT_KO[short] : msg.slice(0, 120));
}

async function guildWrite(functionName: string, args: unknown[]): Promise<boolean> {
  const wc = activeWalletClient;
  if (!wc?.account) {
    useStore.getState().setGuildError("지갑이 없습니다.");
    return false;
  }
  try {
    const tx = await queueTx(() =>
      wc.writeContract({
        account: wc.account!,
        chain: wc.chain,
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName,
        args,
      } as Parameters<typeof wc.writeContract>[0]),
    );
    await publicClient.waitForTransactionReceipt({ hash: tx });
    await syncGuilds();
    return true;
  } catch (err) {
    guildError(err);
    return false;
  }
}

export function chainCreateGuild(name: string, emblem: string): void {
  void guildWrite("createGuild", [name, emblem]);
}

export function chainJoinGuild(guildId: string): void {
  void guildWrite("joinGuild", [BigInt(guildId)]);
}

export function chainLeaveGuild(): void {
  void guildWrite("leaveGuild", []);
}

// ---------- 던전 ----------

const run: {
  guildId: string;
  attempt: number;
  seed: `0x${string}`;
  picks: number[];
} = { guildId: "0", attempt: 0, seed: "0x", picks: [] };

function doorRollLocal(
  seed: `0x${string}`,
  guildId: bigint,
  attempt: number,
  step: number,
  door: number,
): "safe" | "bonus" | "trap" {
  const digest = keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint32", "uint256", "uint8"],
      [seed, guildId, attempt, BigInt(step), door],
    ),
  );
  const b = hexToBytes(digest)[0];
  if (b < 154) return "safe";
  if (b < 192) return "bonus";
  return "trap";
}

export async function chainDungeonEnter(): Promise<void> {
  const s = useStore.getState();
  s.setDungeon(null);
  const my = s.walletAddress?.toLowerCase();
  const guild = my
    ? s.guilds.find((g) => g.members.some((m) => m.address.toLowerCase() === my))
    : undefined;
  if (!guild) {
    s.setGuildError("던전은 길드 원정입니다 — 먼저 길드에 가입하세요.");
    return;
  }
  const wc = activeWalletClient;
  if (!wc?.account) return;
  try {
    const tx = await queueTx(() =>
      wc.writeContract({
        account: wc.account!,
        chain: wc.chain,
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "enterExpedition",
        args: [],
      }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    let attempt = 0;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "ExpeditionStarted") {
          attempt = Number((ev.args as unknown as { attempt: number }).attempt);
        }
      } catch {
        /* skip */
      }
    }
    const epoch = (await publicClient.readContract({
      address: GUILDS_ADDRESS,
      abi: GUILDS_ABI,
      functionName: "currentEpoch",
    })) as bigint;
    const [seed, seedBlock] = await Promise.all([
      publicClient.readContract({
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "epochSeed",
        args: [epoch],
      }) as Promise<`0x${string}`>,
      publicClient.readContract({
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "epochSeedBlock",
        args: [epoch],
      }) as Promise<bigint>,
    ]);
    run.guildId = guild.id;
    run.attempt = attempt;
    run.seed = seed;
    run.picks = [];
    useStore.getState().setDungeon({
      guildId: guild.id,
      guildName: guild.name,
      emblem: guild.emblem,
      epoch: Number(epoch),
      seedBlock: Number(seedBlock),
      seedHash: seed,
      offchain: false,
      floor: guild.dungeon.floor,
      tentative: 0,
      attempt,
      busy: false,
    });
  } catch (err) {
    guildError(err);
  }
}

export function chainDungeonPick(door: number): void {
  const s = useStore.getState();
  const d = s.dungeon;
  if (!d || d.ended) return;
  const outcome = doorRollLocal(run.seed, BigInt(run.guildId), run.attempt, run.picks.length, door);
  if (outcome === "trap") {
    run.picks = [];
    s.patchDungeon({ lastOutcome: "trap", lastDoor: door, tentative: 0, ended: true, busy: false });
    return;
  }
  run.picks.push(door);
  s.patchDungeon({
    lastOutcome: outcome,
    lastDoor: door,
    tentative: d.tentative + (outcome === "safe" ? 1 : 2),
    busy: false,
  });
}

export async function chainDungeonBank(): Promise<void> {
  const s = useStore.getState();
  if (!s.dungeon || run.picks.length === 0) return;
  s.patchDungeon({ busy: true });
  const wc = activeWalletClient;
  if (!wc?.account) return;
  try {
    const tx = await queueTx(() =>
      wc.writeContract({
        account: wc.account!,
        chain: wc.chain,
        address: GUILDS_ADDRESS,
        abi: GUILDS_ABI,
        functionName: "settleRun",
        args: [run.attempt, run.picks],
      }),
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    let climbed = 0;
    let floor = s.dungeon.floor;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: GUILDS_ABI, data: log.data, topics: log.topics });
        if (ev.eventName === "RunSettled") {
          const a = ev.args as unknown as { climbed: number; floor: number };
          climbed = a.climbed;
          floor = a.floor;
        }
      } catch {
        /* skip */
      }
    }
    run.picks = [];
    useStore.getState().patchDungeon({
      banked: climbed,
      floor,
      tentative: 0,
      ended: true,
      busy: false,
    });
    void syncGuilds();
  } catch (err) {
    useStore.getState().patchDungeon({ busy: false });
    guildError(err);
  }
}
