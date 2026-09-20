import assert from "node:assert/strict";
import { test } from "node:test";
import { act, addFighter, createExpedition, setInput, tickExpedition } from "../shared/expedition.ts";

const setup = () => { const s=createExpedition(); const p=addFighter(s,"one","대원",1); return {s,p}; };
test("클라이언트 입력은 방향뿐: 큰 값·NaN으로 순간이동할 수 없다",()=>{
  const {s,p}=setup(); const x=p.x,z=p.z;
  setInput(s,p.id,{x:1e20,z:1e20,damage:99999,hp:99999});tickExpedition(s,100);
  assert.ok(Math.hypot(p.x-x,p.z-z)<=.601);assert.equal(p.hp,100);
  setInput(s,p.id,{x:NaN,z:Infinity});tickExpedition(s,100);assert.ok(Number.isFinite(p.x));
  for(let i=0;i<10;i++)tickExpedition(s,100);
  const stop=p.x;tickExpedition(s,100);assert.equal(p.x,stop);
});
test("공격 사거리·재사용 시간·임의 피해량 거절",()=>{
  const {s,p}=setup(); const e=s.enemies[0];
  assert.equal(act(s,p.id,"attack"),false);assert.equal(e.hp,90);
  p.x=e.x;p.z=e.z;
  assert.equal(act(s,p.id,{damage:100000}),false);
  assert.equal(act(s,p.id,"attack"),true);assert.equal(e.hp,72);
  for(let i=0;i<100;i++)act(s,p.id,"attack");assert.equal(e.hp,72);
  s.now=650;assert.equal(act(s,p.id,"skill"),true);assert.equal(e.hp,37);
  s.now=1300;assert.equal(act(s,p.id,"skill"),false);
});
test("공격 예고는 위치를 고정하고 원 밖으로 회피할 수 있다",()=>{
  const {s,p}=setup();s.enemies=s.enemies.slice(0,1);const e=s.enemies[0];
  e.warning={x:p.x,z:p.z,radius:2.5,hitAt:100};p.x+=4;
  tickExpedition(s,100);assert.equal(p.hp,100);assert.equal(e.warning,null);
  e.warning={x:p.x,z:p.z,radius:2.5,hitAt:200};tickExpedition(s,100);assert.equal(p.hp,86);
});
test("숲 도깨비 → 대장 → 완료, 쓰러진 대원은 공격 불가",()=>{
  const {s,p}=setup();s.enemies.forEach(e=>e.hp=0);tickExpedition(s,50);
  assert.equal(s.phase,"boss");assert.equal(s.enemies[0].maxHp,360);
  p.hp=0;assert.equal(act(s,p.id,"attack"),false);tickExpedition(s,50);assert.equal(s.phase,"defeat");
  const other=setup();other.s.enemies.forEach(e=>e.hp=0);tickExpedition(other.s,50);
  other.s.enemies[0].hp=0;tickExpedition(other.s,50);assert.equal(other.s.phase,"victory");
  assert.equal(addFighter(other.s,"late","late",1),null);
});
test("전원 쓰러졌을 때만 전멸, 파티는 최대 4명",()=>{
  const {s,p}=setup();for(let i=2;i<=4;i++)assert.ok(addFighter(s,String(i),"동료",1));
  assert.equal(addFighter(s,"5","초과",1),null);p.hp=0;tickExpedition(s,50);assert.equal(s.phase,"guards");
  s.players.forEach(p=>p.hp=0);tickExpedition(s,50);assert.equal(s.phase,"defeat");
});
test("서로 다른 인스턴스의 체력과 진행은 독립",()=>{
  const a=setup(),b=setup();a.p.x=a.s.enemies[0].x;a.p.z=a.s.enemies[0].z;act(a.s,a.p.id,"attack");
  assert.equal(a.s.enemies[0].hp,72);assert.equal(b.s.enemies[0].hp,90);
  a.s.players=[];tickExpedition(a.s,100);assert.equal(b.p.hp,100);
});
test("무료 동행 원정은 이동·회피·공격만으로 끝까지 클리어 가능",()=>{
  const {s,p}=setup();
  for(let i=0;i<4000 && s.phase!=="victory" && s.phase!=="defeat";i++){
    const target=s.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    const dangers=s.enemies.filter(e=>e.hp>0&&e.warning).map(e=>e.warning);
    let dx=0,dz=0;
    if(dangers.some(w=>Math.hypot(p.x-w.x,p.z-w.z)<w.radius+.5)){
      const dirs=Array.from({length:16},(_,i)=>({x:Math.cos(i*Math.PI/8),z:Math.sin(i*Math.PI/8)}));
      dirs.sort((a,b)=>Math.min(...dangers.map(w=>Math.hypot(p.x+b.x*4-w.x,p.z+b.z*4-w.z)-w.radius))-
        Math.min(...dangers.map(w=>Math.hypot(p.x+a.x*4-w.x,p.z+a.z*4-w.z)-w.radius)));
      dx=dirs[0].x;dz=dirs[0].z;
    }else if(target&&Math.hypot(target.x-p.x,target.z-p.z)>2.6){dx=target.x-p.x;dz=target.z-p.z;}
    setInput(s,p.id,{x:dx,z:dz});act(s,p.id,"skill");act(s,p.id,"attack");tickExpedition(s,50);
  }
  assert.equal(s.phase,"victory");assert.ok(p.hp>0);
});
