// 원정 입장 실패를 사람 말로 — 브라우저 · 소켓을 모르는 순수 모듈이라 npm test 가 그대로 불러 본다.
// 전에는 "입장하지 못했습니다. 코드·정원·진행 상태를 확인하세요." 뒤에 Colyseus 의 영어 원문
// (room "AbC12" not found 같은)을 그대로 붙여, 셋 중 무엇이 문제인지는 결국 영어로만 알 수 있었다.

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) + "…" : s);

/** 입장 실패 한 줄 — 갈래를 알면 그 갈래만 말하고, 모르면 원문의 첫 줄을 짧게 붙인다 */
export function entryErrorText(err: unknown): string {
  const msg = (err instanceof Error ? err.message : String(err ?? "")).trim();
  const m = msg.toLowerCase();
  if (/not found|invalid room/.test(m)) return "그 입장 코드의 원정을 찾지 못했습니다 — 코드를 다시 확인하세요.";
  if (/is locked|already full|full/.test(m)) return "이미 정원이 찼거나 끝난 원정입니다 — 새 원정을 열어 보세요.";
  if (/failed to fetch|network|econnrefused|websocket|timeout|timed out|offline/.test(m))
    return "원정 서버에 닿지 못했습니다 — 잠시 뒤 다시 시도하세요.";
  if (/[가-힣]/.test(msg)) return clip(msg, 80); // 우리가 던진 한국어 사유는 그대로
  const first = msg.split("\n")[0].trim();
  return first ? `입장하지 못했습니다 (${clip(first, 60)}).` : "입장하지 못했습니다. 잠시 뒤 다시 시도하세요.";
}
