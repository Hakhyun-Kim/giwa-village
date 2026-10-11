import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanServer } from "../shared/wsurl.ts";

test("공개망의 평문 ws · 경로 · 사용자 정보가 붙은 서버는 버린다",()=>{
  assert.equal(cleanServer("ws://evil.example.com"),"");
  assert.equal(cleanServer("ws://localhost:2567"),"ws://localhost:2567");
  assert.equal(cleanServer("wss://a.example/path?q=1"),"");
  assert.equal(cleanServer("wss://user@host.example"),"");
  assert.equal(cleanServer("wss://host.example:99999"),"");
  assert.equal(cleanServer("WSS://Host.Example:0443/"),"wss://host.example:443");
  assert.equal(cleanServer("javascript:alert(1)"),"");
});
