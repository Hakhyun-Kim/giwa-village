// 전송 실패를 사람 말로 — 지갑 · 브라우저를 모르는 순수 모듈이라 npm test 가 그대로 불러 본다.
// 창마다 viem 의 영어 원문(여러 줄 · 주소 · 요청 인자)을 100자에서 자르던 것을 이 한 곳으로 모았다.

/** tx 실패 사유를 몇 갈래로 — 계측(analytics)과 화면 문구가 같은 갈래를 쓴다 */
export function txReason(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/user rejected|denied|rejected the request/.test(m)) return "rejected";
  if (/insufficient|잔액|exceeds the balance/.test(m)) return "insufficient";
  if (/revert|execution reverted/.test(m)) return "reverted";
  if (/nonce|underpriced/.test(m)) return "nonce";
  if (/timeout|timed out|network|fetch/.test(m)) return "network";
  return "other";
}

const SAY: Record<string, string> = {
  rejected: "지갑에서 취소했습니다.",
  insufficient: "잔액이 모자랍니다 — 가스비를 낼 테스트 ETH 를 먼저 받아 오세요.",
  nonce: "앞선 전송이 아직 처리 중입니다 — 잠시 뒤 다시 눌러 주세요.",
  network: "체인에 닿지 못했습니다 — 잠시 뒤 다시 시도해 주세요.",
};

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + "…" : s);

/** 창에 띄울 한 줄 — 갈래를 알면 우리 말로, 컨트랙트가 거절했으면 그 이유를, 모르면 원문의 첫 줄만 */
export function txErrorText(err: unknown, max = 100): string {
  const msg = err instanceof Error ? err.message : String(err);
  const kind = txReason(err);
  if (SAY[kind]) return SAY[kind];
  if (kind === "reverted") {
    const why =
      msg.match(/reverted with the following reason:\s*\n?\s*([^\n]+)/)?.[1] ??
      msg.match(/execution reverted:?\s*([^\n"]+)/)?.[1] ??
      msg.match(/reverted:\s*([^\n"]+)/)?.[1];
    return clip(why?.trim() ? `체인이 거절했습니다: ${why.trim()}` : "체인이 거절했습니다.", max);
  }
  return clip(msg.split("\n")[0].trim() || "알 수 없는 오류", max);
}
