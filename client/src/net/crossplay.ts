// 크로스플레이 링크를 이 페이지에서 짓는 쪽 — 규칙은 shared/crosslink.ts, 화면은 ui/CrossPlay.tsx · ui/RaidInvite.tsx.
import { buildLink, cleanCode, cleanServer, intentLink } from "../../../shared/crosslink";
import { WS_URL } from "../config/giwa";

const UA = typeof navigator === "undefined" ? "" : navigator.userAgent;
export const PLATFORM: "android" | "ios" | "desktop" =
  /Android/i.test(UA) ? "android" : /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1) ? "ios" : "desktop";

/** 이 페이지로 돌아오는 초대 주소 — QR 과 Android 폴백이 쓴다. 앱이 없는 사람은 웹에서 같은 원정에 합류한다 */
export function inviteUrl(code: string): string {
  const c = cleanCode(code);
  return `${location.origin}${location.pathname}${c ? `?raid=${c}` : ""}`;
}

/** 앱을 여는 주소 — Android 는 intent(앱이 없으면 웹으로 돌아온다), PC 는 giwa://. iOS 는 앱이 없어 null */
export function appHref(code: string, online: boolean): string | null {
  const link = { server: online ? cleanServer(WS_URL) : "", code: online ? cleanCode(code) : "" };
  if (PLATFORM === "ios") return null;
  return PLATFORM === "android" ? intentLink(link, inviteUrl(link.code)) : buildLink(link);
}

/** 초대 링크(?raid=<코드>)로 들어왔으면 그 코드 */
export const INVITE_CODE = typeof location === "undefined" ? "" : cleanCode(new URLSearchParams(location.search).get("raid"));
