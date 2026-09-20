import type { Room } from "colyseus.js";
import type { CombatAction, ExpeditionState } from "../../../shared/expedition";
import { liveClient, localPos, sendMove } from "./colyseus";
import { useStore } from "../state/store";
import { CAVE_GATE, FIELD_GATE, VILLAGE_GATE, fieldWalk, setCombatSnapshot, useWorld } from "../state/world";
import { sendBeacon } from "../chain/presence";
import { setMood } from "../audio/ambience";
import { sfxHit, sfxSlain } from "../audio/sfx";
import { addShake } from "../game/feel";
import { combatSnapshot } from "../state/world";

let arena: Room | null = null;
let sequence = 0;
let pump: ReturnType<typeof setInterval> | undefined;
const input = { x:0,z:0 };
export const combatFeel = { swingAt:0 };
let lastSnapshot = 0;
export function combatInput(x:number,z:number) { input.x=x; input.z=z; }
export function combatAction(action:CombatAction) {
  const s=combatSnapshot, me=s?.players.find(p=>p.id===useWorld.getState().fighterId);
  if (!arena || !s || !me || me.hp<=0 || s.phase==="victory" || s.phase==="defeat" || s.now<me.attackAt ||
      (action==="skill"&&s.now<me.skillAt) || performance.now()-combatFeel.swingAt<250) return;
  if(!s.enemies.some(e=>e.hp>0&&Math.hypot(e.x-me.x,e.z-me.z)<=(action==="skill"?5:3.4)))return;
  combatFeel.swingAt=performance.now();sfxHit();arena.send("action",action);
}
function clearSession() {
  fieldWalk.active=false;
  clearInterval(pump); pump = undefined; input.x=0; input.z=0;
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
export async function enterExpedition(code = "") {
  const world = useWorld.getState();
  if (world.entering || world.zone !== "field") return;
  if (world.server !== "online") { useWorld.setState({notice:"실시간 던전은 서버 연결이 필요합니다. 들판과 마을은 계속 둘러볼 수 있습니다."}); return; }
  if (Math.hypot(localPos.x-CAVE_GATE.x,localPos.z-CAVE_GATE.z)>5) {
    useWorld.setState({notice:"북쪽 산채 입구까지 이동하세요. 입구 근처에서 원정을 시작할 수 있습니다."}); return;
  }
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
      const me=snapshot.players.find(p=>p.id===joined.sessionId); if (!me) return;
      const previous=combatSnapshot;
      const oldHp=previous?.players.find(p=>p.id===joined.sessionId)?.hp;
      if(oldHp!==undefined&&me.hp<oldHp)addShake(.2);
      if(previous?.phase!=="victory"&&snapshot.phase==="victory")sfxSlain();
      lastSnapshot=Date.now(); setCombatSnapshot(snapshot);
      if (!initialized) {
        initialized=true; clearTimeout(deadline); resetVillageUI();
        localPos.x=me.x;localPos.z=me.z;localPos.rot=me.rot;
        useWorld.setState({zone:"dungeon",entering:false,instanceId:joined.roomId,fighterId:joined.sessionId,
          notice:"다솔: 도깨비에게 다가가 R로 공격해요. 붉은 원 밖으로 피하세요!"});
        sendMove(localPos.x,localPos.z,localPos.rot); void setMood("hunt",1);
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
