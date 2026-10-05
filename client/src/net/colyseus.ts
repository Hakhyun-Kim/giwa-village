import type { Client, Room } from "colyseus.js";
import { WS_URL } from "../config/giwa";
import { track } from "./analytics";
import { startDemo } from "../demo/demo";
import { sendEmoteOnChain, applyPeers } from "../chain/village";
import { activeWalletClient } from "../wallet/wallet";
import { useStore, remoteTargets } from "../state/store";
import { liveAddresses, liveTargets, useWorld } from "../state/world";

export const localPos = { x: 0, z: 5, rot: 0, ready: false };
// colyseus.js 는 룸 서버에 붙을 때만 받는다 — 서버가 없거나 꺼져 있으면 이 짐(약 110KB)을 받지 않는다.
let client: Promise<Client> | null = null;
export function liveClient(): Promise<Client> {
  return client ??= import("colyseus.js").then(m => new m.Client(WS_URL)).catch(err => { client = null; throw err; });
}
interface Peer { id: string; name: string; address: string; color: number; x: number; z: number; rot: number; zone: string }
let room: Room | null = null;
let generation = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
let runtime: Promise<void> | null = null;
// 꺼진 서버를 두드리는 간격 — 4초에서 두 배씩 60초까지. 붙으면 처음으로 돌아간다
const FIRST_WAIT = 4000;
let wait = FIRST_WAIT;
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
function later(seq: number) {
  useWorld.setState({ server:"offline" }); // 그동안은 서버 없이 돈다 — 체인 프레즌스 · 혼자 연습
  retry = setTimeout(() => void connect(seq),wait); wait = Math.min(wait*2,60000);
}
// 서버가 떠 있는지 한 번 묻는다(PROTOCOL.md §0 — GET /). 꺼져 있으면 colyseus.js 도 받지 않고 /matchmake 도 두드리지 않는다
async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${WS_URL.replace(/^ws/,"http")}/`,{ cache:"no-store",signal:AbortSignal.timeout(3000) });
    return (await res.json())?.service === "giwa-village-server";
  } catch { return false; }
}
async function connect(seq: number) {
  if (seq !== generation) return;
  if (!(await reachable())) { if (seq === generation) later(seq); return; }
  if (seq !== generation) return;
  const s = useStore.getState();
  try {
    const joined = await (await liveClient()).joinOrCreate("village_live", { name:s.selfName,color:s.selfColor });
    if (seq !== generation) { void joined.leave(); return; }
    room = joined; wait = FIRST_WAIT; useWorld.setState({ server:"online" });
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
      room = null; clearInterval(heartbeat); clearPeers(); later(seq);
    });
    joined.send("ready"); sendMove(localPos.x,localPos.z,localPos.rot);
    heartbeat = setInterval(() => sendMove(localPos.x,localPos.z,localPos.rot),1000);
  } catch {
    if (seq === generation) later(seq);
  }
}
export async function joinVillage(): Promise<void> {
  const seq = ++generation; disconnect(); wait = FIRST_WAIT;
  // 재접속 때 NPC·지갑·위치를 재초기화하지 않는다. 브라우저 수명의 공통 런타임.
  runtime ??= startDemo(localPos).catch(err => { runtime = null; throw err; });
  await runtime;
  if (seq !== generation) return;
  if (!WS_URL) { useWorld.setState({server:"offline"}); return; }
  useWorld.setState({server:"connecting"}); void connect(seq);
}
export function leaveVillage() { ++generation; napping = false; disconnect(); useWorld.setState({server:"offline"}); }
// 잊고 열어 둔 탭이 무료 서버의 대역폭을 갉지 않게(guide/DEPLOY.md) — 2분 숨어 있으면 마을 룸에서 내리고, 다시 보이면 잇는다
// (뒤 탭으로 열려 한 번도 보이지 않은 페이지도 같다 — 처음에 한 번 본다)
let napping = false, hidden: ReturnType<typeof setTimeout> | undefined;
function nap() {
  clearTimeout(hidden);
  if (document.hidden) hidden = setTimeout(() => { if (WS_URL && runtime && !napping) { leaveVillage(); napping = true; } },120000);
  else if (napping) { napping = false; void joinVillage(); }
}
if (typeof document !== "undefined") { document.addEventListener("visibilitychange",nap); nap(); }
export function sendMove(x:number,z:number,rot:number) { room?.send("move",{x,z,rot,zone:useWorld.getState().zone}); }
export function sendEmote(icon:string) { track("emote", { icon, via: room ? "server" : "chain" }); if (room) room.send("emote",icon); else sendEmoteOnChain(icon); }
