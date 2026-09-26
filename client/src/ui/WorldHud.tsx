import { useEffect, useState } from "react";
import { CAVE_GATE, combatSnapshot, fieldWalk, useWorld } from "../state/world";
import { localPos } from "../net/colyseus";
import { combatAction, enterExpedition, goField, returnVillage } from "../net/expedition";
import { useStore } from "../state/store";
import { ATTACK_RANGE } from "../../../shared/expedition";
import "./world.css";

export default function WorldHud() {
  const world=useWorld(); const [code,setCode]=useState("");const [copied,setCopied]=useState(false);
  const [tick,setTick]=useState(0);
  const showcasing=useStore(s=>s.showcasing);
  useEffect(()=>{const id=setInterval(()=>setTick(t=>t+1),150);return()=>clearInterval(id);},[]);
  void tick;
  const snap=combatSnapshot;const me=snap?.players.find(p=>p.id===world.fighterId);
  const near=Math.hypot(localPos.x-CAVE_GATE.x,localPos.z-CAVE_GATE.z)<5;
  const range=!!me&&!!snap?.enemies.some(e=>e.hp>0&&Math.hypot(e.x-me.x,e.z-me.z)<=ATTACK_RANGE);
  const offline=world.server!=="online";
  const finished=snap?.phase==="victory"||snap?.phase==="defeat";
  const skillLeft=me&&snap?Math.max(0,Math.ceil((me.skillAt-snap.now)/1000)):0;
  if(showcasing)return null;
  if(world.zone==="village")return <div className="world-village-entry">
    <span className={`server-dot ${world.server}`}/><span>{world.server==="online"?"실시간 서버 연결됨":world.server==="connecting"?"서버 연결 확인 중":"서버 없이 마을 진행 중"}</span>
    <button onClick={()=>goField()}>북문 · 마을 밖으로 ↗</button>
  </div>;
  return <div className="world-hud">
    <header className="world-header"><div><small>GIWA VILLAGE / {world.zone==="field"?"OUTSKIRTS":"EXPEDITION"}</small><h1>{world.zone==="field"?"솔바람 들판":"솔바람 산채"}</h1>
      <p>{world.zone==="field"?"마을을 벗어나, 동료와 한 걸음 더":"도깨비의 공격을 피하고 산채의 평온을 되찾으세요"}</p></div>
      <button className="world-back" onClick={()=>world.zone==="dungeon"?goField("원정을 마치고 들판으로 돌아왔습니다."):returnVillage()}>{world.zone==="dungeon"?"들판으로 귀환":"마을로 돌아가기"}</button>
    </header>
    <section className="world-objective"><small>촌장의 부탁 · 산채의 소란</small><h2>{world.zone==="field"?"01  교관과 산채로":snap?.phase==="guards"?"02  숲 도깨비를 물리치기":snap?.phase==="boss"?"03  도깨비 대장과 맞서기":snap?.phase==="victory"?"원정 완료":"다시 도전할 시간"}</h2>
      <p>{world.zone==="field"?`북쪽 산채 입구까지 ${Math.ceil(Math.hypot(localPos.x-CAVE_GATE.x,localPos.z-CAVE_GATE.z))}m · W/A/S/D 이동`:
        snap?.phase==="boss"?"다솔: 큰 붉은 원이 보이면 옆으로 빠져요. 공격이 끝나면 다시 다가가세요!":"다솔: R은 가까운 적 공격, Q는 주위에 강한 일격이에요. 붉은 원을 피하세요."}</p>
      <ol><li className="done">들판으로 나오기</li><li className={world.zone==="dungeon"?"done":""}>산채에 입장하기</li><li className={snap?.phase==="boss"||snap?.phase==="victory"?"done":""}>숲 도깨비 2명 물리치기</li><li className={snap?.phase==="victory"?"done":""}>대장을 물리치고 귀환</li></ol>
    </section>
    {world.notice&&<p className="world-notice" role="status">{world.notice}</p>}
    {world.zone==="field"?<section className="world-entry-card">{offline
        ?<><small>솔바람 산채 · 혼자 연습 + 교관 다솔</small><h2>다솔과 연습해 볼까요?</h2><p>실시간 서버 없이도 이 기기에서 산채 원정을 끝까지 연습할 수 있어요. 규칙은 함께하는 원정과 같습니다.</p></>
        :<><small>솔바람 산채 · 1–4인 + 교관 다솔</small><h2>함께 들어갈까요?</h2><p>혼자 시작해도 다솔이 도와줍니다. 새 원정을 만들고 입장 코드를 동료에게 알려주세요.</p></>}
      {!near&&<button onClick={()=>{fieldWalk.active=true;}}>다솔 따라 산채 입구로</button>}
      <div className="world-entry-actions"><button disabled={!near||world.entering} onClick={()=>void enterExpedition()}>{world.entering?"입장 준비 중…":offline?"혼자 연습 시작":"새 원정 시작"}</button>
      <input aria-label="원정 입장 코드" placeholder="동료의 입장 코드" maxLength={24} value={code} disabled={offline} onChange={e=>setCode(e.target.value)}/>
      <button disabled={!near||!code.trim()||offline||world.entering} onClick={()=>void enterExpedition(code)}>동료에게 합류</button></div>
      <p className="world-fine">{!near?"길을 따라 북쪽 산채 입구까지 이동하세요.":offline?"입구 도착 · F 키로도 혼자 연습을 시작할 수 있어요.":"입구 도착 · F 키로도 새 원정을 시작할 수 있어요."}{offline&&" 동료와 합류하려면 실시간 서버가 연결되어야 해요."}</p>
      <small>전투 체험은 가스 0 · 전투 점수와 체력은 이번 원정에서만 유지됩니다.</small>
    </section>:<>
      <aside className="world-party"><small>원정대 {snap?.players.length??1}/4</small>
        {snap?.players.map(p=><div className="party-member" key={p.id}><b>{p.name}{p.id===world.fighterId?" (나)":""}</b><progress value={p.hp} max={p.maxHp}/><span>{p.hp}/{p.maxHp}{p.hp<=0?" · 쓰러짐":""}</span></div>)}
        {world.instanceId?<div className="instance-code">입장 코드 <b>{world.instanceId}</b><button onClick={async()=>{try{await navigator.clipboard.writeText(world.instanceId);setCopied(true);}catch{setCopied(false);}}}>{copied?"복사됨":"복사"}</button></div>
          :<div className="instance-code">혼자 연습 · 이 기기에서 진행</div>}
        <small>교관 다솔 동행 · 온체인 보상 없음</small>
      </aside>
      {!finished&&<div className="combat-hotbar"><div className="player-health"><b>내 체력 {me?.hp??100} / 100</b><progress value={me?.hp??100} max={100}/><span>{me?.hp===0?"동료의 전투를 지켜보거나 귀환하세요":range?"공격 사거리 안":"적에게 가까이 다가가세요"}</span></div>
        <button disabled={!me||me.hp<=0||!range||(snap?.now??0)<me.attackAt} onClick={()=>combatAction("attack")}><kbd>R</kbd> 기본 공격 <small>가까운 적 1명</small></button>
        <button disabled={!me||me.hp<=0||skillLeft>0} onClick={()=>combatAction("skill")}><kbd>Q</kbd> 회전 일격 <small>{skillLeft>0?`${skillLeft}초` : "주변 5m · 재사용 5초"}</small></button>
      </div>}
      {finished&&<section className="world-result"><small>{snap?.phase==="victory"?"산채에 평온이 돌아왔습니다":"잠시 숨을 고르세요"}</small><h2>{snap?.phase==="victory"?"첫 원정을 마쳤어요!":"원정대가 쓰러졌습니다"}</h2><p>{snap?.phase==="victory"?"다솔: 멋진 협동이었어요. 다음에는 동료와 함께 와볼까요?":"붉은 원 밖으로 이동하면 피해를 피할 수 있어요. 들판에서 새 원정을 시작할 수 있습니다."}</p><p className="world-fine">이번 결과는 세션 기록입니다. 온체인 자산·길드 층수는 변경되지 않습니다.</p><button onClick={()=>goField("산채 입구에서 새 원정을 시작할 수 있습니다.")}>들판으로 돌아가기</button></section>}
    </>}
  </div>;
}
