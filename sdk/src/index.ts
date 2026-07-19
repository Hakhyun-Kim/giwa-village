// @giwa-village/sdk — 기와장터 온체인 소셜 데이터 읽기 전용 SDK.
// 서버·API 키 없이 GIWA Sepolia RPC만으로 지갑의 마을 프로필(길드·칭호·
// 장신구·문양·온기·전리품)·길드 리더보드·노점·프레즌스를 읽는다.
// 참조 구현: 게임 클라이언트의 client/src/chain/* (동일 컨트랙트 소비).
import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
  parseAbi,
  parseAbiItem,
  type PublicClient,
} from "viem";

export const giwaSepolia = defineChain({
  id: 91342,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia-rpc.giwa.io"] } },
  blockExplorers: {
    default: { name: "GIWA Explorer", url: "https://sepolia-explorer.giwa.io" },
  },
  testnet: true,
});

/** 배포 주소 (GIWA Sepolia · 전부 Blockscout Verified) */
export const ADDRESSES = {
  market: "0x1f34506cda6619fc3124d68742a8fd5e7ba436e2",
  guilds: "0x65e4de091071d2f0d47b24f1ada5c2c7ba2c7638",
  presence: "0x4d600672cefae3c8462f3d9feb2cb739001e7a93",
  honors: "0x7e230f68c4dabe64e6de231ea3085e50f0d5a57f",
  offers: "0x534a29c47667b54eab6995517705cfbc423bb909",
  boxes: "0xeb0349f00fc781c807b6d15c74d7f5fb15996b2e",
  hearth: "0xf780265d5f49abd8c7e5d18d81d33426f62f3365",
  workshop: "0x664762337e529f853949a94e6ed50e6d8016c975",
  boss: "0x8f50d882fc936f481f5f66d76156ebdf816cc6ae",
  profile: "0xefe0e8d69661fd67f5fe2368f9b1f7ff6d395416",
} as const;

const PROFILE_ABI = parseAbi([
  "struct Profile { uint256 guildIdPlus1; string guildName; string guildEmblem; uint256 honorMask; uint256 honorEquipped; uint256 trinketMask; uint8 trinketEquipped; bool wearing; bytes16 wearPixels; uint16 wearPalette; uint32 warmth; uint32 trophies; }",
  "function profileOf(address) view returns (Profile memory)",
]);

const GUILDS_ABI = parseAbi([
  "struct DungeonState { uint32 epoch; uint16 floor; uint16 best; uint32 runs; uint32 attempts; }",
  "struct Guild { string name; string emblem; address founder; uint64 createdAt; address[] members; DungeonState d; }",
  "function allGuilds() view returns (Guild[] memory)",
]);

const MARKET_ABI = parseAbi([
  "struct StallItem { string name; string emoji; uint128 price; }",
  "struct Stall { string title; int32 x; int32 z; uint64 openedAt; bool open; StallItem[] items; }",
  "function openStalls() view returns (address[] memory, Stall[] memory)",
]);

const BEACON_EVENT = parseAbiItem(
  "event Beacon(address indexed who, int32 x100, int32 z100, int16 vx100, int16 vz100, uint8 emote)",
);

export const HONOR_NAMES = ["", "개점", "길드 창설자", "등반가", "고층 정복자", "등반왕"] as const;
export const TRINKET_NAMES = ["", "깃털", "조개", "도토리", "네잎클로버", "나비", "풍경", "꽃잎", "별조각"] as const;

export interface VillageProfile {
  guildId: number | null;
  guildName: string | null;
  guildEmblem: string | null;
  /** 보유 칭호 이름 목록 (소울바운드) */
  honors: string[];
  equippedHonor: string | null;
  /** 보유 장신구 이름 목록 (랜덤박스, 소울바운드) */
  trinkets: string[];
  equippedTrinket: string | null;
  /** 착용 문양 (8x8 픽셀, 온체인 원본) */
  wear: { pixels: `0x${string}`; palette: number } | null;
  /** 모닥불 온기 (함께 있음의 증명) */
  warmth: number;
  /** 도깨비 토벌 전리품 */
  trophies: number;
}

function maskToNames(mask: bigint | number, names: readonly string[]): string[] {
  const m = Number(mask);
  return names.filter((n, i) => i > 0 && (m & (1 << i)) !== 0 && n);
}

export function createVillageClient(rpcUrl?: string) {
  const client: PublicClient = createPublicClient({
    chain: giwaSepolia,
    transport: http(rpcUrl),
  });

  return {
    client,

    /** 지갑의 마을 소셜 프로필 — RPC 1콜 */
    async getProfile(address: `0x${string}`): Promise<VillageProfile> {
      const p = await client.readContract({
        address: ADDRESSES.profile,
        abi: PROFILE_ABI,
        functionName: "profileOf",
        args: [address],
      });
      return {
        guildId: p.guildIdPlus1 > 0n ? Number(p.guildIdPlus1 - 1n) : null,
        guildName: p.guildIdPlus1 > 0n ? p.guildName : null,
        guildEmblem: p.guildIdPlus1 > 0n ? p.guildEmblem : null,
        honors: maskToNames(p.honorMask, HONOR_NAMES),
        equippedHonor: HONOR_NAMES[Number(p.honorEquipped)] || null,
        trinkets: maskToNames(p.trinketMask, TRINKET_NAMES),
        equippedTrinket: TRINKET_NAMES[p.trinketEquipped] || null,
        wear: p.wearing ? { pixels: p.wearPixels, palette: p.wearPalette } : null,
        warmth: p.warmth,
        trophies: p.trophies,
      };
    },

    /** 길드 전체 — 이번 주 등반 순위로 정렬 */
    async getLeaderboard() {
      const list = await client.readContract({
        address: ADDRESSES.guilds,
        abi: GUILDS_ABI,
        functionName: "allGuilds",
      });
      return [...list]
        .map((g, i) => ({
          id: i,
          name: g.name,
          emblem: g.emblem,
          members: [...g.members],
          weeklyFloor: g.d.floor,
          bestFloor: g.d.best,
          runs: g.d.runs,
        }))
        .sort((a, b) => b.weeklyFloor - a.weeklyFloor || b.bestFloor - a.bestFloor);
    },

    /** 열려 있는 노점 전체 */
    async getStalls() {
      const [owners, data] = await client.readContract({
        address: ADDRESSES.market,
        abi: MARKET_ABI,
        functionName: "openStalls",
      });
      return owners.map((owner, i) => ({
        owner,
        title: data[i].title,
        x: data[i].x / 100,
        z: data[i].z / 100,
        items: data[i].items.map((it) => ({
          name: it.name,
          emoji: it.emoji,
          priceEth: formatEther(it.price),
        })),
      }));
    },

    /** 프레즌스 비컨 구독 — 마을에 지금 누가 움직이는지 */
    watchPresence(
      onBeacon: (b: { who: `0x${string}`; x: number; z: number; emote: number }) => void,
      pollMs = 3000,
    ): () => void {
      let last = 0n;
      let stopped = false;
      const tick = async () => {
        if (stopped) return;
        try {
          const bn = await client.getBlockNumber();
          if (last === 0n) last = bn > 30n ? bn - 30n : 0n;
          if (bn > last) {
            const logs = await client.getLogs({
              address: ADDRESSES.presence,
              event: BEACON_EVENT,
              fromBlock: last + 1n,
              toBlock: bn,
            });
            last = bn;
            for (const l of logs) {
              if (l.args.who) {
                onBeacon({
                  who: l.args.who,
                  x: Number(l.args.x100) / 100,
                  z: Number(l.args.z100) / 100,
                  emote: l.args.emote ?? 0,
                });
              }
            }
          }
        } catch {
          /* 다음 폴 */
        }
        setTimeout(tick, pollMs);
      };
      void tick();
      return () => {
        stopped = true;
      };
    },
  };
}
