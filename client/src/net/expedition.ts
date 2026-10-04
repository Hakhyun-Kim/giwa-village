import type { Room } from "colyseus.js";
import { act, addFighter, createExpedition, setInput, tickExpedition, type CombatAction, type ExpeditionState, type Fighter } from "../../../shared/expedition";
import { liveClient, localPos, sendMove } from "./colyseus";
import { useStore } from "../state/store";
import { CAVE_GATE, FIELD_GATE, VILLAGE_GATE, fieldWalk, setCombatSnapshot, useWorld } from "../state/world";
import { sendBeacon } from "../chain/presence";
import { setMood } from "../audio/ambience";
import { sfxHit, sfxSlain } from "../audio/sfx";
import { addShake } from "../game/feel";
import { combatSnapshot } from "../state/world";

let arena: Room | null = null;
// 서버가 없을 때 혼자 하는 연습 원정 — 서버가 돌리는 shared/expedition.ts 를 이 브라우저에서 그대로 돌린다(PROTOCOL.md §3.7).
// 체인에 아무것도 쓰지 않고 보상도 없다 — 온라인 원정과 같다.
let practice: ExpeditionState | null = null;
const PRACTICE_ID = "practice-self";
const STEP = 50;
let sequence = 0;
let pump: ReturnType<typeof setInterval> | undefined;
const input = { x:0,z:0 };
export const combatFeel = { swingAt:0 };
let lastSnapshot = 0;
export function combatInput(x:number,z:number) { input.x=x; input.z=z; }
export function combatAction(action:CombatAction) {
  const s=combatSnapshot, me=s?.players.find(p=>p.id===useWorld.getState().fighterId);
  if ((!arena && !practice) || !s || !me || me.hp<=0 || s.phase==="victory" || s.phase==="defeat" || s.now<me.attackAt ||
      (action==="skill"&&s.now<me.skillAt) || performance.now()-combatFeel.swingAt<250) return;
  if(!s.enemies.some(e=>e.hp>0&&Math.hypot(e.x-me.x,e.z-me.z)<=(action==="skill"?5:3.4)))return;
  combatFeel.swingAt=performance.now();sfxHit();
  if (practice) { if (act(practice,PRACTICE_ID,action)) receive(structuredClone(practice),PRACTICE_ID); }
  else arena?.send("action",action);
}
// 온라인 · 연습 두 갈래가 같은 길로 스냅숏을 받는다 — 흔들림 · 승리음 · 그리기가 한 벌이다.
function receive(snapshot:ExpeditionState,id:string) {
  const me=snapshot.players.find(p=>p.id===id); if (!me) return null;
  const previous=combatSnapshot;
  const oldHp=previous?.players.find(p=>p.id===id)?.hp;
  if(oldHp!==undefined&&me.hp<oldHp)addShake(.2);
  if(previous?.phase!=="victory"&&snapshot.phase==="victory")sfxSlain();
  lastSnapshot=Date.now(); setCombatSnapshot(snapshot);
  return me;
}
function arrive(me:{x:number;z:number;rot:number},instanceId:string,fighterId:string,notice:string) {
  resetVillageUI();
  localPos.x=me.x;localPos.z=me.z;localPos.rot=me.rot;
  useWorld.setState({zone:"dungeon",entering:false,instanceId,fighterId,notice});
  sendMove(localPos.x,localPos.z,localPos.rot); void setMood("hunt",1);
}
function clearSession() {
  fieldWalk.active=false;
  clearInterval(pump); pump = undefined; input.x=0; input.z=0;
  practice = null;
  const old = arena; arena = null;
  old?.removeAllListeners(); if (old) void old.leave().catch(() => {});
  setCombatSnapshot(null);
}
function resetVillageUI() {
  useStore.setState({ nearPortal:false,nearBoss:false,nearFire:false,selfSitting:false,
    stallView:null,stallOpenDialog:false,guildOpen:false,dungeonOpen:false,giftTarget:null,
    socialTarget:null,couponsOpen:false,workshopOpen:false,honorsOpen:false,ledgerOpen:false });
}
export function goField(notice = "교관 다솔을 따라 북쪽 산채 입구로 가세요.") {
  if (useWorld.getState().zone === "village") void sendBeacon(255,true);
  ++sequence; clearSession(); resetVillageUI();
  localPos.x=FIELD_GATE.x; localPos.z=FIELD_GATE.z-6; localPos.rot=Math.PI;
  useWorld.setState({zone:"field",entering:false,instanceId:"",fighterId:"",notice});
  sendMove(localPos.x,localPos.z,localPos.rot); void setMood("village");
}
export function returnVillage() {
  ++sequence; clearSession(); resetVillageUI();
  localPos.x=VILLAGE_GATE.x; localPos.z=VILLAGE_GATE.z+3; localPos.rot=0;
  useWorld.setState({zone:"village",entering:false,instanceId:"",fighterId:"",notice:"마을로 돌아왔습니다. 영구 기록은 그대로 유지됩니다."});
  sendMove(localPos.x,localPos.z,localPos.rot); void setMood("village");
}
// 50ms 고정 걸음 — 서버 룸과 같은 박자. 탭이 느려져도 한 번에 네 걸음까지만 따라잡는다.
function startPractice() {
  const seq=++sequence; clearSession();
  const s=useStore.getState();
  const state=createExpedition();
  if (!addFighter(state,PRACTICE_ID,s.selfName,s.selfColor)) return;
  practice=state;
  const me=receive(structuredClone(state),PRACTICE_ID); if (!me) return;
  arrive(me,"",PRACTICE_ID,"다솔: 오늘은 둘이서 연습해요. 도깨비에게 다가가 R로 공격하고, 붉은 원 밖으로 피하세요!");
  let last=performance.now(), carry=0;
  pump=setInterval(() => {
    if (seq!==sequence || practice!==state) return;
    const now=performance.now(); carry=Math.min(carry+now-last,STEP*4); last=now;
    let stepped=false;
    while (carry>=STEP) { setInput(state,PRACTICE_ID,input); tickExpedition(state,STEP); carry-=STEP; stepped=true; }
    if (stepped) receive(structuredClone(state),PRACTICE_ID);
  },STEP);
}
// 서버는 동의 없이 끊긴 대원의 자리를 20초 지킨다(ExpeditionRoom · PROTOCOL.md §3.7) — 그 안에 같은 토큰으로 다시 붙는다.
// 휴대폰이 QR 을 찍으러 카메라로 갔다 오거나 알림을 보고 돌아와도 같은 대원으로 이어진다.
const RECONNECT_MS = 18000;
// 처음 입장과 다시 잇기가 같은 길로 룸을 붙든다
function hold(room:Room,seq:number,first?:(me:Fighter)=>void) {
  arena=room; lastSnapshot=Date.now();
  room.onMessage("combat",(snapshot:ExpeditionState) => {
    if (seq!==sequence || arena!==room) return;
    const me=receive(snapshot,room.sessionId); if (!me) return;
    if (first) { const f=first; first=undefined; f(me); }
  });
  room.onLeave(code => {
    if (seq!==sequence || arena!==room) return;
    // 끝난 원정은 서버도 기다리지 않는다 — 결과 카드를 그대로 두고 소켓만 내려놓는다
    const phase=combatSnapshot?.phase;
    if (phase==="victory" || phase==="defeat") { arena=null; room.removeAllListeners(); return; }
    // 4000 은 서버가 정중히 내보낸 것(정원 · 잠긴 원정), 도착 전 끊김은 입장 실패다 — 다시 붙지 않는다
    if (code===4000 || useWorld.getState().zone!=="dungeon") goField("서버 연결이 끊겨 안전한 들판으로 돌아왔습니다. 이번 전투 기록은 세션과 함께 종료됩니다.");
    else void rejoin(room,seq);
  });
  room.send("ready");
}
// quiet: 소켓은 멀쩡한데 스냅숏이 끊긴 경우(서버가 답하지 않는다) — 끝내 못 이으면 그렇게 알린다
async function rejoin(old:Room,seq:number,quiet=false) {
  if (arena!==old) return;
  arena=null; old.removeAllListeners();
  useWorld.setState({notice:"연결이 끊겼어요 — 같은 원정에 다시 잇는 중…"});
  const until=Date.now()+RECONNECT_MS;
  while (seq===sequence && Date.now()<until) {
    // 시도 하나도 남은 시간을 넘기지 않는다 — 반쯤 열린 망에서는 요청 하나가 몇 분씩 매달린다
    const attempt=liveClient().then(c => c.reconnect(old.reconnectionToken));
    const timeout=new Promise<null>(r => setTimeout(() => r(null),Math.max(0,until-Date.now())));
    let room:Room|null;
    try { room=await Promise.race([attempt,timeout]); }
    catch (err) {
      // 4212 = 룸이 사라졌다 — 기다려도 소용없다. 4214(토큰이 아직 · 이미 무효)는 서버가 끊김을 알아채기 전일 수 있어 다시 묻는다
      if ((err as { code?: unknown })?.code===4212) break;
      await new Promise(r => setTimeout(r,1500)); continue;
    }
    if (!room) { void attempt.then(r => r.leave(),() => {}); break; } // 늦게 붙는 룸은 닫는다
    if (seq!==sequence) { void room.leave(); return; }
    hold(room,seq); useWorld.setState({notice:"원정에 다시 이어졌어요."}); return;
  }
  if (seq!==sequence) return;
  if (quiet) goField("원정 서버의 응답이 없어 들판으로 돌아왔습니다.");
  else goField("서버 연결이 끊겨 안전한 들판으로 돌아왔습니다. 이번 전투 기록은 세션과 함께 종료됩니다.");
}
if (typeof window!=="undefined") window.addEventListener("pagehide",() => { void arena?.leave().catch(() => {}); });
export async function enterExpedition(code = "") {
  const world = useWorld.getState();
  if (world.entering || world.zone !== "field") return;
  const offline = world.server !== "online";
  if (offline && code.trim()) { useWorld.setState({notice:"동료와 합류하려면 실시간 서버가 필요해요. 지금은 혼자 연습 원정을 할 수 있습니다."}); return; }
  if (Math.hypot(localPos.x-CAVE_GATE.x,localPos.z-CAVE_GATE.z)>5) {
    useWorld.setState({notice:"북쪽 산채 입구까지 이동하세요. 입구 근처에서 원정을 시작할 수 있습니다."}); return;
  }
  if (offline) { startPractice(); return; }
  const seq=++sequence; const s=useStore.getState();
  useWorld.setState({entering:true,notice:"원정대가 모일 공간을 준비하고 있습니다…"});
  // 늦게 도착한 join 응답도 세대 검사 후 닫는다. 타임아웃 뒤 유령 룸에 입장하지 않는다.
  const deadline=setTimeout(() => {
    if (sequence===seq) { ++sequence; clearSession(); useWorld.setState({entering:false,notice:"입장 응답이 늦습니다. 다시 시도하세요."}); }
  },10000);
  try {
    const client = await liveClient();
    const joined = code.trim()
      ? await client.joinById(code.trim(),{name:s.selfName,color:s.selfColor})
      : await client.create("expedition",{name:s.selfName,color:s.selfColor});
    if (sequence!==seq) { void joined.leave(); return; }
    // 다른 종류의 룸 코드로 입장하지 않는다.
    if (joined.name !== "expedition") { void joined.leave(); throw new Error("원정 입장 코드가 아닙니다."); }
    hold(joined,seq,me => {
      clearTimeout(deadline);
      arrive(me,joined.roomId,joined.sessionId,"다솔: 도깨비에게 다가가 R로 공격해요. 붉은 원 밖으로 피하세요!");
    });
    pump=setInterval(() => {
      const room=arena; if (!room) return; // 다시 잇는 중
      // 5초 동안 스냅숏이 없으면 끊긴 것으로 본다 — 스스로 나가지 않고(동의 없는 끊김) 같은 자리로 다시 잇는다
      if (Date.now()-lastSnapshot>5000) {
        if (useWorld.getState().zone!=="dungeon") { goField("원정 서버의 응답이 없어 들판으로 돌아왔습니다."); return; } // 도착 전이면 입장 실패
        void rejoin(room,seq,true); void room.leave(false).catch(() => {}); return;
      }
      room.send("input",input);
    },50);
  } catch (err) {
    if (seq===sequence) { clearSession(); useWorld.setState({entering:false,notice:`입장하지 못했습니다. 코드·정원·진행 상태를 확인하세요. ${err instanceof Error ? err.message : ""}`}); }
  } finally { if (sequence!==seq || !arena) clearTimeout(deadline); }
}

export function interactWorld(): boolean {
  const zone=useWorld.getState().zone;
  if (zone==="dungeon") return false;
  if(zone==="village" && Math.hypot(localPos.x-VILLAGE_GATE.x,localPos.z-VILLAGE_GATE.z)<5) { goField();return true; }
  if(zone==="field") {
    if (Math.hypot(localPos.x-CAVE_GATE.x,localPos.z-CAVE_GATE.z)<5) void enterExpedition();
    else if (Math.hypot(localPos.x-FIELD_GATE.x,localPos.z-FIELD_GATE.z)<5) returnVillage();
    return true;
  }
  return false;
}
