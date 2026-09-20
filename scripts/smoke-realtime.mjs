// 실제 Colyseus 소켓 검증. 격리된 로컬 서버만 띄우며 체인·지갑 키 파일을 사용하지 않는다.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { Client } from "colyseus.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const port=2578;
const url=`http://127.0.0.1:${port}`;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=6000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await wait(35);}throw new Error("조건 대기 시간 초과");}
try { await fetch(url,{signal:AbortSignal.timeout(500)}); throw new Error("검증용 2578 포트가 사용 중입니다."); } catch(e) { if(e.message.includes("사용 중"))throw e; }
const proc=spawn(process.execPath,["--import","tsx","server/src/index.ts"],{env:{...process.env,PORT:String(port),HOST:"127.0.0.1"},stdio:["ignore","pipe","pipe"]});
let logs="";proc.stdout.on("data",d=>logs+=d);proc.stderr.on("data",d=>logs+=d);
const rooms=[];const client=new Client(url.replace("http","ws"));
async function expedition(code){const r=code?await client.joinById(code,{name:"동료"}):await client.create("expedition",{name:"대원"});rooms.push(r);let snapshot;
  r.onMessage("combat",s=>snapshot=s);r.send("ready");await until(()=>snapshot);return {r,get state(){return snapshot;}};}
try {
  await until(async()=>{try{return (await fetch(url)).ok;}catch{return false;}});
  const a=await expedition(), b=await expedition(), mate=await expedition(a.r.roomId);
  await until(()=>a.state.players.length===2);
  assert.notEqual(a.r.roomId,b.r.roomId);assert.equal(b.state.players.length,1);
  a.r.send("input",{x:1e9,z:0,damage:999999});await wait(200);
  const p=a.state.players.find(p=>p.id===a.r.sessionId);assert.ok(p.x<1);assert.equal(p.hp,100);
  a.r.send("action",{damage:999999,target:"guard-0"});await wait(100);assert.equal(a.state.enemies[0].hp,90);
  assert.equal(b.state.enemies[0].hp,90);assert.equal(mate.state.players.length,2);
  await expedition(a.r.roomId);await expedition(a.r.roomId);
  await assert.rejects(()=>client.joinById(a.r.roomId,{name:"다섯째"}));
  console.log("PASS 실제 소켓: 인스턴스 분리·합류·4인 제한·이동 속도·피해 위조 거절");
  const relay=await client.joinOrCreate("village_live",{name:"상인"});rooms.push(relay);
  let challenge,peers=[];relay.onMessage("challenge",m=>challenge=m);relay.onMessage("snapshot",s=>peers=s);relay.send("ready");await until(()=>challenge);
  assert.equal(peers[0].address,"");
  const account=privateKeyToAccount(generatePrivateKey());
  relay.send("identify",{address:account.address,signature:await account.signMessage({message:challenge})});
  await until(()=>peers.some(p=>p.address===account.address.toLowerCase()));
  relay.send("move",{x:8,z:5,rot:0,zone:"field"});await until(()=>peers[0].zone==="field");
  console.log("PASS 실시간 중계: 일회성 서명 인증·구역 변경");
  let left=false;a.r.onLeave(()=>left=true);proc.kill();await until(()=>left);
  console.log("PASS 서버 종료 시 소켓 종료 감지");
} catch(e) { console.error(logs.slice(-3000));throw e; }
finally { for(const r of rooms){r.removeAllListeners();void r.leave().catch(()=>{});}if(proc.exitCode===null)proc.kill(); }
