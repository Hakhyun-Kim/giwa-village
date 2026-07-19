// 풀온체인 마을 레이어 (서버리스) — 오케스트레이터 + 배럴.
// 실제 구현은 도메인별 모듈에 있다:
//   core.ts     공통 상수·자기 위치 참조
//   stalls.ts   노점 동기화·개설·구매
//   ledger.ts   판매자 장부·환불
//   guilds.ts   길드·던전 (로컬 판정 + settleRun 정산)
//   honors.ts   소울바운드 칭호·코스메틱 정의
//   presence.ts 비컨·데드레커닝·피어 꾸미기·피드 폴링
import { useStore } from "../state/store";
import type { LocalPos } from "./core";
import { selfPos } from "./core";
import { syncStalls } from "./stalls";
import { syncGuilds } from "./guilds";
import { fetchHonors } from "./honors";
import { equippedTrinketOf } from "./boxes";
import { fetchHearth, gatherHearth, claimHearth } from "./hearth";
import { wornPatternOf } from "./workshop";
import { refreshBoss } from "./boss";
import {
  applyPeers,
  checkBeaconBudget,
  initPresence,
  pollChain,
  sendBeacon,
  BEACON_INTERVAL_MS,
  READ_INTERVAL_MS,
} from "./presence";

export * from "./core";
export * from "./stalls";
export * from "./ledger";
export * from "./gifts";
export * from "./offers";
export * from "./boxes";
export * from "./hearth";
export * from "./workshop";
export * from "./boss";
export * from "./guilds";
export * from "./honors";
export * from "./presence";

const STALL_SYNC_MS = 12000;
const GUILD_SYNC_MS = 20000;

let started = false;

export function startOnchainVillage(localPos: LocalPos): void {
  if (started) return;
  started = true;
  selfPos.ref = localPos;
  initPresence();

  void syncStalls().catch(() => {});
  void syncGuilds().catch(() => {});
  void checkBeaconBudget();
  void refreshSelfHonor();

  setInterval(() => void syncStalls().catch(() => {}), STALL_SYNC_MS);
  setInterval(() => void syncGuilds().catch(() => {}), GUILD_SYNC_MS);
  setInterval(() => void checkBeaconBudget(), 60000);
  setInterval(() => void hearthTick().catch(() => {}), 30000);
  void refreshBoss();
  setInterval(() => void refreshBoss(), 15000);
  setInterval(() => void sendBeacon(), BEACON_INTERVAL_MS);
  setInterval(() => void pollChain(), READ_INTERVAL_MS);
  setInterval(() => applyPeers(), 250);

  window.addEventListener("beforeunload", () => {
    // 퇴장 비컨 (best-effort)
    void sendBeacon(255);
  });
}

/** 모닥불 자동 의식: 앉아 있으면 화로에 모이고(gather), 닫힌 화로의 온기를 받는다 */
async function hearthTick(): Promise<void> {
  const s = useStore.getState();
  const my = s.walletAddress;
  if (!my || !s.selfSitting) return;
  const st = await fetchHearth(my);
  if (st.prevClaimable) {
    await claimHearth(st.window - 1);
    const id = useStore.getState().selfId;
    if (id) {
      useStore.getState().setEmote(id, "🔥");
      const at = useStore.getState().emotes[id]?.at;
      if (at) setTimeout(() => useStore.getState().clearEmote(id, at), 2600);
    }
  }
  if (!st.joinedNow) await gatherHearth();
}

/** 내 장착 칭호·장신구를 스토어에 반영 — 자기 아바타 코스메틱용 */
export async function refreshSelfHonor(): Promise<void> {
  const my = useStore.getState().walletAddress;
  if (!my) return;
  try {
    const p = await fetchHonors(my);
    useStore.getState().setSelfHonor(p.equipped || null);
  } catch {
    /* 다음 기회에 */
  }
  try {
    const t = await equippedTrinketOf(my);
    useStore.getState().setSelfTrinket(t || null);
  } catch {
    /* 다음 기회에 */
  }
  try {
    const w = await wornPatternOf(my);
    useStore.getState().setSelfWear(w);
  } catch {
    /* 다음 기회에 */
  }
}
