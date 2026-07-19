import { create } from "zustand";
import type {
  PlayerInfo,
  EmoteEvent,
  FeedEvent,
  Stall,
  Guild,
  DungeonView,
} from "../types";

export type ConnectionStatus = "connecting" | "connected" | "offline";

interface VillageStore {
  status: ConnectionStatus;
  selfId: string | null;
  onlineCount: number;
  players: Record<string, PlayerInfo>;
  emotes: Record<string, EmoteEvent>;
  walletAddress: string | null;
  walletKind: "injected" | "burner" | null;
  walletSlot: string | null;
  balanceEth: string | null;
  walletError: string | null;
  nearPortal: boolean;
  nearFire: boolean;
  selfSitting: boolean;
  selfName: string;
  selfColor: number;
  giftTarget: string | null;
  feed: FeedEvent[];
  stalls: Stall[];
  stallView: string | null;
  stallOpenDialog: boolean;
  couponsOpen: boolean;
  couponsVersion: number;
  selfDojang: boolean;
  guilds: Guild[];
  guildOpen: boolean;
  guildError: string | null;
  dungeonOpen: boolean;
  dungeon: DungeonView | null;
  honorsOpen: boolean;
  ledgerOpen: boolean;
  /** 내가 장착한 칭호 id (아바타 코스메틱) */
  selfHonor: number | null;
  /** 내가 장착한 장신구 id (랜덤박스) */
  selfTrinket: number | null;
  /** 내가 착용한 공방 문양 ("pixelsHex:palette") */
  selfWear: string | null;
  workshopOpen: boolean;
  /** 도깨비 상태 (주간 보스) */
  boss: { remaining: number; slain: boolean; myContrib: number; nextStrikeAt: number; trophies: number } | null;
  nearBoss: boolean;
  /** 전송 큐에서 처리 중인 tx 수 (HUD 칩) */
  pendingTx: number;

  setStatus: (s: ConnectionStatus) => void;
  setSelfId: (id: string | null) => void;
  setOnlineCount: (n: number) => void;
  setPlayers: (p: Record<string, PlayerInfo>) => void;
  removePlayer: (id: string) => void;
  setEmote: (id: string, icon: string) => void;
  clearEmote: (id: string, at: number) => void;
  setWallet: (
    address: string | null,
    kind?: "injected" | "burner",
    slot?: string,
  ) => void;
  setBalance: (eth: string | null) => void;
  setWalletError: (msg: string | null) => void;
  setNearPortal: (v: boolean) => void;
  setNearFire: (v: boolean) => void;
  setSelfSitting: (v: boolean) => void;
  setSelfIdentity: (name: string, color: number) => void;
  setGiftTarget: (id: string | null) => void;
  addFeed: (g: FeedEvent) => void;
  setStalls: (s: Stall[]) => void;
  setStallView: (id: string | null) => void;
  setStallOpenDialog: (v: boolean) => void;
  setCouponsOpen: (v: boolean) => void;
  bumpCoupons: () => void;
  setSelfDojang: (v: boolean) => void;
  setGuilds: (g: Guild[]) => void;
  setGuildOpen: (v: boolean) => void;
  setGuildError: (msg: string | null) => void;
  setDungeonOpen: (v: boolean) => void;
  setDungeon: (d: DungeonView | null) => void;
  setHonorsOpen: (v: boolean) => void;
  setLedgerOpen: (v: boolean) => void;
  setSelfHonor: (id: number | null) => void;
  setSelfTrinket: (id: number | null) => void;
  setSelfWear: (w: string | null) => void;
  setWorkshopOpen: (v: boolean) => void;
  setBoss: (b: { remaining: number; slain: boolean; myContrib: number; nextStrikeAt: number; trophies: number } | null) => void;
  setNearBoss: (v: boolean) => void;
  bumpPendingTx: (delta: number) => void;
  patchDungeon: (d: Partial<DungeonView>) => void;
}

export const useStore = create<VillageStore>((set) => ({
  status: "connecting",
  selfId: null,
  onlineCount: 0,
  players: {},
  emotes: {},
  walletAddress: null,
  walletKind: null,
  walletSlot: null,
  balanceEth: null,
  walletError: null,
  nearPortal: false,
  nearFire: false,
  selfSitting: false,
  selfName: "",
  selfColor: 0x5aa0e6,
  giftTarget: null,
  feed: [],
  stalls: [],
  stallView: null,
  stallOpenDialog: false,
  couponsOpen: false,
  couponsVersion: 0,
  selfDojang: false,
  guilds: [],
  guildOpen: false,
  guildError: null,
  dungeonOpen: false,
  dungeon: null,
  honorsOpen: false,
  ledgerOpen: false,
  selfHonor: null,
  selfTrinket: null,
  selfWear: null,
  workshopOpen: false,
  boss: null,
  nearBoss: false,
  pendingTx: 0,

  setStatus: (status) => set({ status }),
  setSelfId: (selfId) => set({ selfId }),
  setOnlineCount: (onlineCount) => set({ onlineCount }),
  setPlayers: (players) => set({ players }),
  removePlayer: (id) =>
    set((s) => {
      if (!(id in s.players)) return s;
      const players = { ...s.players };
      delete players[id];
      return { players };
    }),
  setEmote: (id, icon) =>
    set((s) => ({ emotes: { ...s.emotes, [id]: { icon, at: Date.now() } } })),
  clearEmote: (id, at) =>
    set((s) => {
      if (s.emotes[id]?.at !== at) return s;
      const emotes = { ...s.emotes };
      delete emotes[id];
      return { emotes };
    }),
  setWallet: (walletAddress, kind, slot) =>
    set({
      walletAddress,
      walletKind: walletAddress ? (kind ?? "injected") : null,
      walletSlot: slot ?? null,
      walletError: null,
    }),
  setBalance: (balanceEth) => set({ balanceEth }),
  setWalletError: (walletError) => set({ walletError }),
  setNearPortal: (nearPortal) => set({ nearPortal }),
  setNearFire: (nearFire) => set({ nearFire }),
  setSelfSitting: (selfSitting) => set({ selfSitting }),
  setSelfIdentity: (selfName, selfColor) => set({ selfName, selfColor }),
  setGiftTarget: (giftTarget) => set({ giftTarget }),
  addFeed: (g) => set((s) => ({ feed: [g, ...s.feed].slice(0, 6) })),
  setStalls: (stalls) => set({ stalls }),
  setStallView: (stallView) => set({ stallView }),
  setStallOpenDialog: (stallOpenDialog) => set({ stallOpenDialog }),
  setCouponsOpen: (couponsOpen) => set({ couponsOpen }),
  bumpCoupons: () => set((s) => ({ couponsVersion: s.couponsVersion + 1 })),
  setSelfDojang: (selfDojang) => set({ selfDojang }),
  setGuilds: (guilds) => set({ guilds }),
  setGuildOpen: (guildOpen) => set({ guildOpen, guildError: null }),
  setGuildError: (guildError) => set({ guildError }),
  setDungeonOpen: (dungeonOpen) => set({ dungeonOpen }),
  setDungeon: (dungeon) => set({ dungeon }),
  setHonorsOpen: (honorsOpen) => set({ honorsOpen }),
  setLedgerOpen: (ledgerOpen) => set({ ledgerOpen }),
  setSelfHonor: (selfHonor) => set({ selfHonor }),
  setSelfTrinket: (selfTrinket) => set({ selfTrinket }),
  setSelfWear: (selfWear) => set({ selfWear }),
  setWorkshopOpen: (workshopOpen) => set({ workshopOpen }),
  setBoss: (boss) => set({ boss }),
  setNearBoss: (nearBoss) => set({ nearBoss }),
  bumpPendingTx: (delta) => set((s) => ({ pendingTx: Math.max(0, s.pendingTx + delta) })),
  patchDungeon: (d) =>
    set((s) => (s.dungeon ? { dungeon: { ...s.dungeon, ...d } } : s)),
}));

/**
 * Live movement targets for remote players.
 * Mutated at snapshot rate (15Hz) outside React state so position
 * interpolation never triggers re-renders.
 */
export const remoteTargets = new Map<
  string,
  { x: number; z: number; rot: number }
>();
