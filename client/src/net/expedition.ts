import type { Room } from "colyseus.js";
import { act, addFighter, createExpedition, setInput, tickExpedition, type CombatAction, type ExpeditionState } from "../../../shared/expedition";
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
    const joined = code.trim()
      ? await liveClient.joinById(code.trim(),{name:s.selfName,color:s.selfColor})
      : await liveClient.create("expedition",{name:s.selfName,color:s.selfColor});
    if (sequence!==seq) { void joined.leave(); return; }
    // 다른 종류의 룸 코드로 입장하지 않는다.
    if (joined.name !== "expedition") { void joined.leave(); throw new Error("원정 입장 코드가 아닙니다."); }
    arena=joined; lastSnapshot=Date.now();
    let initialized=false;
    joined.onMessage("combat",(snapshot:ExpeditionState) => {
      if (seq!==sequence) return;
      const me=receive(snapshot,joined.sessionId); if (!me) return;
      if (!initialized) {
        initialized=true; clearTimeout(deadline);
        arrive(me,joined.roomId,joined.sessionId,"다솔: 도깨비에게 다가가 R로 공격해요. 붉은 원 밖으로 피하세요!");
      }
    });
    joined.onLeave(() => { if(seq===sequence) goField("서버 연결이 끊겨 안전한 들판으로 돌아왔습니다. 이번 전투 기록은 세션과 함께 종료됩니다."); });
    joined.send("ready");
    pump=setInterval(() => {
      if (Date.now()-lastSnapshot>5000) { goField("원정 서버의 응답이 없어 들판으로 돌아왔습니다."); return; }
      joined.send("input",input);
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
