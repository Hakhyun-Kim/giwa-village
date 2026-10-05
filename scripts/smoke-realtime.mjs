// 실제 Colyseus 소켓 검증. 격리된 로컬 서버만 띄우며 체인·지갑 키 파일을 사용하지 않는다.
import assert from "node:assert/strict";
import http from "node:http";
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
  // 터널 · 프록시는 루프백으로 들어온다 — 전달 헤더가 붙은 요청에는 개발 지갑 창구가 닫혀야 한다(파일을 읽기 전에 거절한다)
  for(const h of ["x-forwarded-for","x-forwarded-host","cf-connecting-ip","true-client-ip","forwarded","x-real-ip","via"])assert.equal((await fetch(`${url}/dev/wallets`,{headers:{[h]:"203.0.113.7"}})).status,403,h);
  // 아무 웹페이지(Origin)나 DNS 리바인딩(Host)으로 온 요청도 막고, 와일드카드 CORS 를 주지 않는다. 키 본문은 읽지 않는다
  // fetch 는 Host 를 바꾸지 못한다 — node:http 로 묻는다
  const dev=headers=>new Promise((ok,no)=>http.get(`${url}/dev/wallets`,{headers},r=>{r.resume();ok(r);}).on("error",no));
  assert.equal((await dev({origin:"https://evil.example"})).statusCode,403,"남의 Origin");
  assert.equal((await dev({origin:"null"})).statusCode,403,"Origin null");
  assert.equal((await dev({host:`rebind.evil.example:${port}`})).statusCode,403,"리바인딩 Host");
  const local=await dev({origin:"http://localhost:5173"});
  assert.notEqual(local.statusCode,403,"이 기기의 페이지");assert.equal(local.headers["access-control-allow-origin"],"http://localhost:5173");
  assert.notEqual((await fetch(url)).headers.get("access-control-allow-origin"),null,"상태 확인 GET / 은 어디서든 읽힌다");
  console.log("PASS 개발 지갑 창구: 터널 · 프록시(전달 헤더 일곱) · 남의 Origin · 리바인딩 Host 는 403 · 이 기기의 페이지에만 그 Origin 을 돌려준다");
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
  const solo=await expedition(), token=solo.r.reconnectionToken, sid=solo.r.sessionId;
  await wait(300);const before={now:solo.state.now,hp:solo.state.players.find(p=>p.id===sid).hp};
  solo.r.removeAllListeners();await solo.r.leave(false);await wait(4000); // 혼자 서 있으면 4초면 맞는다 — 기다리는 동안은 빠져 있어야 한다
  const back=await client.reconnect(token);rooms.push(back);let again;back.onMessage("combat",s=>again=s);back.send("ready");await until(()=>again);
  assert.equal(back.sessionId,sid);const me=again.players.find(p=>p.id===sid);assert.ok(me,"끊겼다 돌아온 대원이 원정에 남아 있어야 한다");
  assert.equal(me.hp,before.hp,"기다리는 동안 맞지 않는다");assert.ok(again.now-before.now<1500,`혼자 하던 원정은 기다리는 동안 시간이 선다(${again.now-before.now}ms)`);
  const guest=await expedition(back.roomId);await until(()=>again.players.length===2);
  guest.r.removeAllListeners();await guest.r.leave();await until(()=>again.players.length===1);
  console.log("PASS 재접속: 동의 없이 끊긴 대원은 같은 자리 · 같은 체력으로(기다리는 동안 맞지 않고 혼자면 시간이 선다) · 스스로 나간 대원은 바로 빠진다");
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
