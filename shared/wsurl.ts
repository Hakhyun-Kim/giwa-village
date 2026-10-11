// 룸 서버 주소 — 빌드가 넘긴 VITE_WS_URL 을 믿기 전에 거른다(client/src/config/giwa.ts).
// 순수 모듈이라 npm test 가 그대로 걸어 본다.

const PRIVATE_HOST = /^(localhost|127(\.\d{1,3}){3}|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/;

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
