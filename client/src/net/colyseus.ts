import { Client, Room } from "colyseus.js";
import { WS_URL, DEMO } from "../config/giwa";
import { track } from "./analytics";
import { startDemo, demoGift, demoBuy } from "../demo/demo";
import {
  openStallOnChain, closeStallOnChain, sendEmoteOnChain,
  chainCreateGuild, chainJoinGuild, chainLeaveGuild, chainDungeonEnter,
  chainDungeonPick, chainDungeonBank, applyPeers,
} from "../chain/village";
import { activeWalletClient } from "../wallet/wallet";
import { useStore, remoteTargets } from "../state/store";
import { liveAddresses, liveTargets, useWorld } from "../state/world";

export const localPos = { x: 0, z: 5, rot: 0, ready: false };
export const liveClient = new Client(WS_URL);
export interface Identity { name?: string; address?: string; color: number }
interface Peer { id: string; name: string; address: string; color: number; x: number; z: number; rot: number; zone: string }
let room: Room | null = null;
let generation = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let runtime: Promise<void> | null = null;
let applied = new Set<string>();
const sessionKeys = new Map<string, string>();

function clearPeers() {
  const s = useStore.getState(); const players = { ...s.players };
  for (const id of applied) { delete players[id]; remoteTargets.delete(id); }
  applied.clear(); sessionKeys.clear(); liveAddresses.clear(); liveTargets.clear();
  s.setPlayers(players); applyPeers();
}
function disconnect() {
  clearTimeout(retry); clearInterval(heartbeat);
  const old = room; room = null;
  old?.removeAllListeners(); if (old) void old.leave().catch(() => {});
  clearPeers();
}
function receive(snapshot: Peer[], selfId: string) {
  const s = useStore.getState(); const players = { ...s.players };
  for (const id of applied) delete players[id];
  const next = new Set<string>(); liveAddresses.clear(); liveTargets.clear(); sessionKeys.clear();
  for (const p of snapshot) {
    if (p.address) liveAddresses.add(p.address.toLowerCase());
    if (p.id === selfId || (p.address && p.address.toLowerCase() === s.walletAddress?.toLowerCase())) continue;
    const id = p.address ? p.address.toLowerCase() : `rt-${p.id}`;
    sessionKeys.set(p.id,id); liveTargets.set(id,p);
    if (p.address) delete players[id];
    if (p.zone !== "village") continue;
    next.add(id);
    players[id] = { name:p.name, address:p.address, color:p.color };
    remoteTargets.set(id,{ x:p.x,z:p.z,rot:p.rot });
  }
  for (const id of applied) if (!next.has(id)) remoteTargets.delete(id);
  applied = next;
  const changed = Object.keys(players).length !== Object.keys(s.players).length ||
    Object.entries(players).some(([id,p]) => !s.players[id] || s.players[id].name !== p.name || s.players[id].color !== p.color);
  if (changed) s.setPlayers(players);
  s.setOnlineCount(Object.keys(players).filter(id => !id.startsWith("npc-")).length + 1);
}
async function connect(seq: number) {
  if (seq !== generation) return;
  const s = useStore.getState();
  try {
    const joined = await liveClient.joinOrCreate("village_live", { name:s.selfName,color:s.selfColor });
    if (seq !== generation) { void joined.leave(); return; }
    room = joined; useWorld.setState({ server:"online" });
    joined.onMessage("snapshot", (peers: Peer[]) => { if (seq === generation) receive(peers,joined.sessionId); });
    joined.onMessage("challenge", async (message: string) => {
      const wc = activeWalletClient;
      // 버너만 자동 인증. 외부 지갑은 추가 팝업 없이 방문자 세션으로 참여한다.
      if (!wc?.account || wc.account.type !== "local" || typeof message !== "string" || !message.startsWith(`GIWA Village session\n${joined.roomId}/${joined.sessionId}\n`)) return;
      try {
        const signature = await wc.signMessage({ account:wc.account, message });
        if (seq === generation) joined.send("identify",{ address:wc.account.address,signature });
      } catch { /* 마을 진행과 전투는 서명 없이도 가능 */ }
    });
    joined.onMessage("emote", (e: { id:string;icon:string }) => {
      const id = sessionKeys.get(e.id); if (!id) return;
      useStore.getState().setEmote(id,e.icon);
      const at = useStore.getState().emotes[id]?.at;
      if (at) setTimeout(() => useStore.getState().clearEmote(id,at),2200);
    });
    joined.onLeave(() => {
      if (seq !== generation) return;
      room = null; clearInterval(heartbeat); clearPeers(); useWorld.setState({ server:"offline" });
      retry = setTimeout(() => void connect(seq),4000);
    });
    joined.send("ready"); sendMove(localPos.x,localPos.z,localPos.rot);
    heartbeat = setInterval(() => sendMove(localPos.x,localPos.z,localPos.rot),1000);
  } catch {
    if (seq !== generation) return;
    useWorld.setState({ server:"offline" }); retry = setTimeout(() => void connect(seq),4000);
  }
}
export async function joinVillage(_identity: Identity): Promise<void> {
  const seq = ++generation; disconnect();
  // 재접속 때 NPC·지갑·위치를 재초기화하지 않는다. 브라우저 수명의 공통 런타임.
  runtime ??= startDemo(localPos).catch(err => { runtime = null; throw err; });
  await runtime;
  if (seq !== generation) return;
  if (DEMO) { useWorld.setState({server:"offline"}); return; }
  useWorld.setState({server:"connecting"}); void connect(seq);
}
export function leaveVillage() { ++generation; disconnect(); useWorld.setState({server:"offline"}); }
export function sendMove(x:number,z:number,rot:number) { room?.send("move",{x,z,rot,zone:useWorld.getState().zone}); }
export function sendEmote(icon:string) { track("emote", { icon, via: room ? "server" : "chain" }); if (room) room.send("emote",icon); else sendEmoteOnChain(icon); }
export function sendGift(to:string,amountEth:string,tx:string) { demoGift(to,amountEth,tx); }
export function buyStallItem(stallId:string,itemId:string,tx:string) { demoBuy(stallId,itemId,tx); }
export function openStall(title:string,items:{name:string;emoji:string;priceEth:string}[]) { return openStallOnChain(title,items); }
export function closeStall() { void closeStallOnChain().catch(e => useStore.getState().setWalletError(String(e))); }
export const createGuild = chainCreateGuild;
export const joinGuild = chainJoinGuild;
export const leaveGuild = chainLeaveGuild;
export const dungeonEnter = chainDungeonEnter;
export const dungeonPick = chainDungeonPick;
export const dungeonBank = chainDungeonBank;
