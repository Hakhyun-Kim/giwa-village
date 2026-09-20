import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Group, Mesh } from "three";
import Avatar from "./Avatar";
import { CAVE_GATE, FIELD_GATE, VILLAGE_GATE, combatSnapshot, liveTargets, useWorld } from "../state/world";
import { combatAction, goField, interactWorld } from "../net/expedition";
import { ARENA_RADIUS } from "../../../shared/expedition";
import { setMood } from "../audio/ambience";
import { localPos } from "../net/colyseus";

function Gate({x,z,label,sub,onClick}:{x:number;z:number;label:string;sub:string;onClick:()=>void}) {
  return <group position={[x,0,z]} onClick={e=>{e.stopPropagation();onClick();}}>
    {[-2.5,2.5].map(x=><mesh key={x} position={[x,2,0]} castShadow><boxGeometry args={[.55,4,.65]}/><meshStandardMaterial color="#494c42"/></mesh>)}
    <mesh position={[0,4.1,0]} castShadow><boxGeometry args={[6,.7,1.2]}/><meshStandardMaterial color="#253c42"/></mesh>
    <mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[1.7,2,48]}/><meshBasicMaterial color="#d0edb6" transparent opacity={.85}/></mesh>
    <Html center position={[0,4.9,0]} distanceFactor={16}><div className="world-sign"><b>{label}</b><small>{sub}</small></div></Html>
  </group>;
}
export function VillageExit() {
  return <Gate x={VILLAGE_GATE.x} z={VILLAGE_GATE.z} label="북문 · 마을 밖" sub="솔바람 들판으로 · F" onClick={()=>goField()}/>;
}
function Pine({x,z,size=1}:{x:number;z:number;size?:number}) {
  return <group position={[x,0,z]} scale={size}>
    <mesh position={[0,1.2,0]} castShadow><cylinderGeometry args={[.18,.3,2.4,6]}/><meshStandardMaterial color="#625644"/></mesh>
    {[2,3.2,4.2].map((y,i)=><mesh key={y} position={[0,y,0]} castShadow><coneGeometry args={[2-i*.4,2.8,7]}/><meshStandardMaterial color={i%2 ? "#46735e":"#315d51"}/></mesh>)}
  </group>;
}
function Companion({combat=false}:{combat?:boolean}) {
  const ref=useRef<Group>(null);const speed=useRef(0);
  useFrame((_,dt)=>{
    if(!ref.current)return;
    const pos=combat ? combatSnapshot?.guide : {x:-2,z:Math.max(-13,localPos.z-3)}; if(!pos)return;
    const dx=pos.x-ref.current.position.x,dz=pos.z-ref.current.position.z;
    speed.current=Math.min(4,Math.hypot(dx,dz)/Math.max(.01,dt));
    if(Math.hypot(dx,dz)>.1)ref.current.rotation.y=Math.atan2(dx,dz);
    ref.current.position.x+=dx*(1-Math.exp(-10*dt)); ref.current.position.z+=dz*(1-Math.exp(-10*dt));
  });
  return <group ref={ref} position={[-3,0,3]}><Avatar color={0x57b7ac} name="교관 다솔" speedRef={speed}/>
    {!combat&&<Html center position={[0,3,0]} distanceFactor={15}><div className="guide-speech">북쪽 산채로 가볼까요?<br/>붉은 공격 예고를 보고 피하면 돼요.</div></Html>}
  </group>;
}
function EnemyActor({id}:{id:string}) {
  const ref=useRef<Group>(null), warning=useRef<Mesh>(null), body=useRef<Group>(null);
  const label=useRef<HTMLDivElement>(null), number=useRef<HTMLSpanElement>(null);
  const lastEvent=useRef(0), flashUntil=useRef(0);
  useFrame(({clock},dt)=>{
    const e=combatSnapshot?.enemies.find(e=>e.id===id); if(!ref.current||!e)return;
    ref.current.visible=e.hp>0;
    ref.current.position.x+=(e.x-ref.current.position.x)*(1-Math.exp(-14*dt));
    ref.current.position.z+=(e.z-ref.current.position.z)*(1-Math.exp(-14*dt));
    if(label.current)label.current.textContent=`${e.name} · ${Math.ceil(e.hp)} / ${e.maxHp}`;
    const event=combatSnapshot?.events.filter(v=>v.kind!=="hurt"&&Math.hypot(v.x-e.x,v.z-e.z)<.1).at(-1);
    if(event&&event.id!==lastEvent.current){lastEvent.current=event.id;flashUntil.current=clock.elapsedTime+.45;if(number.current)number.current.textContent=`−${event.amount}`;}
    if(number.current){number.current.style.opacity=clock.elapsedTime<flashUntil.current?"1":"0";}
    if(body.current){body.current.position.y=Math.sin(clock.elapsedTime*3)*.06;body.current.rotation.z=clock.elapsedTime<flashUntil.current?.15:0;}
    if(warning.current){
      warning.current.visible=!!e.warning&&e.hp>0;
      if(e.warning){warning.current.position.set(e.warning.x,.055,e.warning.z);warning.current.scale.setScalar(e.warning.radius);}
    }
  });
  const boss=id==="forest-chief";
  return <>
    <mesh ref={warning} rotation={[-Math.PI/2,0,0]} visible={false}><circleGeometry args={[1,48]}/><meshBasicMaterial color="#ff553e" transparent opacity={.42} depthWrite={false}/></mesh>
    <group ref={ref} onClick={e=>{e.stopPropagation();combatAction("attack");}}>
      <group ref={body} scale={boss?1.65:1}>
        <mesh position={[0,.85,0]} castShadow><sphereGeometry args={[.85,12,10]}/><meshStandardMaterial color={boss?"#794988":"#598975"}/></mesh>
        <mesh position={[0,1.9,0]} castShadow><sphereGeometry args={[.7,12,10]}/><meshStandardMaterial color={boss?"#9e67a1":"#74a588"}/></mesh>
        {[-.4,.4].map(x=><group key={x}>
          <mesh position={[x,2.6,0]} rotation={[0,0,-x]}><coneGeometry args={[.16,.8,6]}/><meshStandardMaterial color="#eedfbb"/></mesh>
          <mesh position={[x*.65,2.05,.6]}><sphereGeometry args={[.12,8,8]}/><meshBasicMaterial color="#ffe77e"/></mesh>
          <mesh position={[x,.18,.08]}><boxGeometry args={[.45,.35,.65]}/><meshStandardMaterial color="#3b4547"/></mesh>
        </group>)}
        <mesh position={[1.1,.95,.3]} rotation={[.2,0,.3]} castShadow><cylinderGeometry args={[.24,.14,1.9,8]}/><meshStandardMaterial color="#786447"/></mesh>
      </group>
      <Html center position={[0,boss?5:3.3,0]} distanceFactor={17}><div className="enemy-label" ref={label}/><span className="combat-number" ref={number}/></Html>
    </group>
  </>;
}
function PartyActor({id,field=false}:{id:string;field?:boolean}) {
  const ref=useRef<Group>(null),speed=useRef(0);
  const p=field?liveTargets.get(id):combatSnapshot?.players.find(p=>p.id===id);
  useFrame((_,dt)=>{
    const p=field?liveTargets.get(id):combatSnapshot?.players.find(p=>p.id===id);
    if(!p||!ref.current)return;
    const dx=p.x-ref.current.position.x,dz=p.z-ref.current.position.z;
    speed.current=Math.min(6,Math.hypot(dx,dz)/Math.max(.01,dt));
    ref.current.position.x+=dx*(1-Math.exp(-14*dt));ref.current.position.z+=dz*(1-Math.exp(-14*dt));ref.current.rotation.y=p.rot;
    ref.current.scale.y="hp" in p && p.hp<=0?.45:1;
  });
  if(!p)return null;
  return <group ref={ref} position={[p.x,0,p.z]}><Avatar name={p.name} color={p.color} speedRef={speed}/></group>;
}
export function Outside() {
  const zone=useWorld(s=>s.zone); const fighter=useWorld(s=>s.fighterId);const dungeon=zone==="dungeon";
  const [ids,setIds]=useState({enemies:"",players:""});
  useEffect(()=>{
    const id=setInterval(()=>{
      const enemies=dungeon?(combatSnapshot?.enemies.map(e=>e.id).join(",")??""):"";
      const players=dungeon?(combatSnapshot?.players.filter(p=>p.id!==fighter).map(p=>p.id).join(",")??""):
        [...liveTargets].filter(([,p])=>p.zone==="field").map(([id])=>id).join(",");
      setIds(old=>old.enemies===enemies&&old.players===players?old:{enemies,players});
      if(dungeon){const boss=combatSnapshot?.enemies.find(e=>e.boss);setMood("hunt",boss?boss.hp/boss.maxHp:1);}
    },200);return()=>clearInterval(id);
  },[dungeon,fighter]);
  return <>
    <color attach="background" args={[dungeon?"#182b35":"#9ebdb4"]}/>
    <fog attach="fog" args={[dungeon?"#182b35":"#9ebdb4",28,90]}/>
    <ambientLight intensity={dungeon?.8:1.2}/>
    <directionalLight position={[8,18,7]} intensity={dungeon?1.5:2.4} color={dungeon?"#a7e0ef":"#ffe6b4"} castShadow shadow-mapSize={[1024,1024]}/>
    <mesh rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[120,120]}/><meshStandardMaterial color={dungeon?"#384852":"#668976"} roughness={.95}/></mesh>
    <mesh rotation={[-Math.PI/2,0,0]} position={[0,.015,0]} receiveShadow><planeGeometry args={[dungeon?36:7,dungeon?36:39]}/><meshStandardMaterial color={dungeon?"#526065":"#ae9e79"}/></mesh>
    {dungeon&&<>
      {Array.from({length:11},(_,i)=>i*3-15).map(v=><group key={v}>
        <mesh position={[v,.026,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[.06,36]}/><meshStandardMaterial color="#354951"/></mesh>
        <mesh position={[0,.026,v]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[36,.06]}/><meshStandardMaterial color="#354951"/></mesh>
      </group>)}
      <mesh position={[0,.035,0]} rotation={[-Math.PI/2,0,0]}><ringGeometry args={[7.8,8,64]}/><meshStandardMaterial color="#acaf88" emissive="#445f5c"/></mesh>
      {[-12,12].flatMap(x=>[-12,12].map(z=><group key={`${x}/${z}`} position={[x,0,z]}>
        <mesh position={[0,.7,0]}><cylinderGeometry args={[.65,.85,1.4,8]}/><meshStandardMaterial color="#30444a"/></mesh>
        <mesh position={[0,1.7,0]}><octahedronGeometry args={[.6]}/><meshStandardMaterial color="#a6ded8" emissive="#4bcbbb" emissiveIntensity={2}/></mesh>
      </group>))}
    </>}
    {Array.from({length:16},(_,i)=>{
      const side=i%2?1:-1,z=Math.floor(i/2)*6-22;
      return dungeon?<mesh key={i} position={[side*(ARENA_RADIUS+1.5),2,z]} castShadow><dodecahedronGeometry args={[3,0]}/><meshStandardMaterial color="#35424d"/></mesh>:
        <Pine key={i} x={side*(11+(i%3)*3)} z={z} size={.9+(i%4)*.15}/>;
    })}
    {dungeon?<>
      {[-1,1].map(side=><mesh key={side} position={[0,2,side*(ARENA_RADIUS+1)]}><boxGeometry args={[40,4,2]}/><meshStandardMaterial color="#35424d"/></mesh>)}
      <Companion combat/>
      {ids.enemies.split(",").filter(Boolean).map(id=><EnemyActor key={id} id={id}/>)}
    </>:<>
      <Gate x={FIELD_GATE.x} z={FIELD_GATE.z+2} label="기와장터" sub="마을로 돌아가기 · F" onClick={()=>interactWorld()}/>
      <Gate x={CAVE_GATE.x} z={CAVE_GATE.z} label="솔바람 산채" sub="1–4인 실시간 원정 · 입구에서 F" onClick={()=>interactWorld()}/>
      <Companion/>
      {[0,1,2].map(i=><mesh key={i} position={[0,.025,5-i*7]} rotation={[-Math.PI/2,0,Math.PI]}><circleGeometry args={[.6,3]}/><meshBasicMaterial color="#f4de9d"/></mesh>)}
    </>}
    {ids.players.split(",").filter(Boolean).map(id=><PartyActor key={id} id={id} field={!dungeon}/>)}
  </>;
}
