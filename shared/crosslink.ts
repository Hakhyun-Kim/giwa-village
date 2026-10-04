// 크로스플레이 링크 — 웹에서 연 원정을 다른 클라이언트(Unity 앱 · PC 게임)가 이어받는 주소 한 벌(PROTOCOL.md §3.8).
//   giwa://expedition?server=<룸 서버>&code=<입장 코드>
// 링크가 나르는 것은 "어느 서버의 어느 원정인가"뿐이다. 지갑 · 키 · 주소는 싣지 않는다 — 받는 쪽은 제 버너로 선다.
// 순수 모듈이라 npm test 가 그대로 걸어 보고, Unity 는 같은 표본을 C# 으로 풀어 대조한다(giwa-village-unity parity).
export const LINK_SCHEME = "giwa";
export const LINK_HOST = "expedition";
export const ANDROID_PACKAGE = "io.github.hakhyunkim.giwavillage";

export interface CrossLink { server: string; code: string }

const CODE = /^[A-Za-z0-9_-]{1,32}$/;
const PRIVATE_HOST = /^(localhost|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;

/** 입장 코드 — 룸 id 모양이 아니면 빈 글자 */
export function cleanCode(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return CODE.test(c) ? c : "";
}

/** 룸 서버 — wss 는 어디든, ws 는 이 기기 · 사설망만(평문을 공개망에 흘리지 않는다). 아니면 빈 글자.
 *  돌려주는 것은 scheme://host[:port] 뿐이다 — 경로 · 질의 · 사용자 정보는 버린다. */
export function cleanServer(server: string | null | undefined): string {
  const s = (server ?? "").trim();
  const m = /^(wss?):\/\/([A-Za-z0-9.-]{1,253})(?::(\d{1,5}))?\/?$/i.exec(s);
  if (!m) return "";
  const [, rawScheme, rawHost, port] = m;
  const scheme = rawScheme.toLowerCase();
  const host = rawHost.toLowerCase();
  if (host.startsWith(".") || host.endsWith(".") || host.includes("..")) return "";
  if (port !== undefined && (Number(port) < 1 || Number(port) > 65535)) return "";
  if (scheme === "ws" && !PRIVATE_HOST.test(host)) return "";
  return `${scheme}://${host}${port !== undefined ? `:${Number(port)}` : ""}`;
}

/** 링크를 짓는다 — 빈 칸은 싣지 않는다. 코드가 없으면 받는 쪽이 새 원정(서버가 있으면) 또는 혼자 연습을 연다 */
export function buildLink(link: Partial<CrossLink>): string {
  const q: string[] = [];
  const server = cleanServer(link.server), code = cleanCode(link.code);
  if (server) q.push(`server=${encodeURIComponent(server)}`);
  if (code) q.push(`code=${code}`);
  return `${LINK_SCHEME}://${LINK_HOST}${q.length ? `?${q.join("&")}` : ""}`;
}

/** 링크를 푼다 — giwa://expedition 이 아니면 null. 이상한 칸은 없는 것으로 친다(링크 하나로 엉뚱한 곳에 붙지 않게) */
export function parseLink(url: string | null | undefined): CrossLink | null {
  const m = /^giwa:\/\/expedition\/?(?:\?([^#]*))?(?:#.*)?$/i.exec((url ?? "").trim());
  if (!m) return null;
  let server = "", code = "";
  for (const pair of (m[1] ?? "").split("&")) {
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    const key = pair.slice(0, at);
    let value: string;
    try { value = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, " ")); } catch { continue; }
    if (key === "server" && !server) server = cleanServer(value);
    else if (key === "code" && !code) code = cleanCode(value);
  }
  return { server, code };
}

/** Android 크롬용 — 앱이 있으면 앱으로, 없으면 fallback(보통 지금 보고 있는 웹 페이지)으로 */
export function intentLink(link: Partial<CrossLink>, fallback: string): string {
  const inner = buildLink(link).slice(`${LINK_SCHEME}://`.length);
  return `intent://${inner}#Intent;scheme=${LINK_SCHEME};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

/** 표본 — Unity 의 C# 파서가 같은 답을 내는지 대조한다(giwa-village-unity tools/project.mjs parity 가 이 목록을 읽는다) */
export const LINK_SAMPLES: string[] = [
  "giwa://expedition",
  "giwa://expedition?code=AbC123",
  "giwa://expedition?server=wss%3A%2F%2Fgiwa-village.fly.dev&code=Xy_9-z",
  "giwa://expedition/?code=AbC123&server=ws%3A%2F%2F192.168.0.7%3A2567",
  "GIWA://EXPEDITION?code=AbC123",
  "giwa://expedition?server=ws%3A%2F%2Fevil.example.com&code=AbC123",
  "giwa://expedition?server=wss%3A%2F%2Fa.example%2Fpath%3Fq%3D1&code=AbC123",
  "giwa://expedition?code=%3Cscript%3E",
  "giwa://expedition?code=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "giwa://expedition?code=%E0%A4%A&server=wss%3A%2F%2Fok.example",
  "giwa://expedition?code=one&code=two",
  "giwa://expedition?server=wss%3A%2F%2Fuser%40host.example&code=AbC123",
  "giwa://expedition?server=wss%3A%2F%2Fhost.example%3A99999",
  "giwa://expedition?server=WSS%3A%2F%2FHost.Example%3A0443%2F#frag",
  "giwa://village?code=AbC123",
  "https://expedition?code=AbC123",
  "",
  // 줄바꿈 · 보이지 않는 공백 — 정규식 · trim 은 언어마다 다르다: 조각(#…)은 줄을 넘지 못하고, trim 은 U+FEFF 를 지우고 U+0085 는 남긴다
  "giwa://expedition?code=AbC123#a\nb",
  "giwa://expedition?code=AbC123#a\rb",
  "giwa://expedition?code=AbC123#a b",
  "giwa://expedition?code=Ab\nC123",
  "GİWA://EXPEDITION?code=AbC123",
  "﻿giwa://expedition?code=AbC123",
  "giwa://expedition?code=AbC123\u0085",
  "giwa://expedition?server=wss%3A%2F%2Fok.example%EF%BB%BF&code=AbC123",
];
