import assert from "node:assert/strict";
import { test } from "node:test";
import { LINK_SAMPLES, buildLink, cleanServer, intentLink, parseLink } from "../shared/crosslink.ts";

test("링크는 서버와 입장 코드만 나른다 — 짓고 풀면 그대로",()=>{
  for (const link of [{server:"",code:""},{server:"wss://giwa-village.fly.dev",code:"AbC123"},{server:"ws://192.168.0.7:2567",code:""},{server:"",code:"Xy_9-z"}])
    assert.deepEqual(parseLink(buildLink(link)),link);
  assert.equal(buildLink({}),"giwa://expedition");
});
test("공개망의 평문 ws · 경로 · 사용자 정보가 붙은 서버는 버린다",()=>{
  assert.equal(cleanServer("ws://evil.example.com"),"");
  assert.equal(cleanServer("ws://localhost:2567"),"ws://localhost:2567");
  assert.equal(cleanServer("wss://a.example/path?q=1"),"");
  assert.equal(cleanServer("wss://user@host.example"),"");
  assert.equal(cleanServer("wss://host.example:99999"),"");
  assert.equal(cleanServer("WSS://Host.Example:0443/"),"wss://host.example:443");
  assert.equal(cleanServer("javascript:alert(1)"),"");
});
test("코드는 룸 id 모양만 — 잘못된 칸은 없는 것으로, 다른 링크는 null",()=>{
  assert.deepEqual(parseLink("giwa://expedition?code=%3Cscript%3E"),{server:"",code:""});
  assert.deepEqual(parseLink("giwa://expedition?code=%E0%A4%A&server=wss%3A%2F%2Fok.example"),{server:"wss://ok.example",code:""});
  assert.deepEqual(parseLink("giwa://expedition?code=one&code=two"),{server:"",code:"one"});
  assert.equal(parseLink("giwa://village?code=AbC123"),null);
  assert.equal(parseLink("https://expedition?code=AbC123"),null);
});
test("Android intent 링크는 앱이 없으면 웹으로 돌아온다",()=>{
  const url=intentLink({server:"wss://giwa-village.fly.dev",code:"AbC123"},"https://hakhyun-kim.github.io/giwa-village/?raid=AbC123");
  assert.match(url,/^intent:\/\/expedition\?server=wss%3A%2F%2Fgiwa-village\.fly\.dev&code=AbC123#Intent;scheme=giwa;package=io\.github\.hakhyunkim\.giwavillage;/);
  assert.ok(url.endsWith(`S.browser_fallback_url=${encodeURIComponent("https://hakhyun-kim.github.io/giwa-village/?raid=AbC123")};end`));
});
test("표본은 모두 풀린다(다른 클라이언트가 대조하는 목록)",()=>{
  assert.ok(LINK_SAMPLES.length>=15);
  const parsed=LINK_SAMPLES.map(parseLink);
  assert.ok(parsed.some(p=>p===null)&&parsed.some(p=>p?.server&&p.code));
});
