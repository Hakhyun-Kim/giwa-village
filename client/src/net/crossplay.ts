// 크로스플레이 링크를 이 페이지에서 짓는 쪽 — 규칙은 shared/crosslink.ts, 화면은 ui/CrossPlay.tsx · ui/RaidInvite.tsx.
import { buildLink, cleanCode, intentLink } from "../../../shared/crosslink";
import { WS_URL } from "../config/giwa";

const UA = typeof navigator === "undefined" ? "" : navigator.userAgent;
// 앱이 있는 곳은 둘뿐이다 — Android(Unity 앱) · Windows(PC 게임). iOS · mac · 리눅스에는 앱 단추를 띄우지 않는다(눌러도 아무 일이 없다)
export const PLATFORM: "android" | "windows" | "other" =
  /Android/i.test(UA) ? "android" : /Windows/i.test(UA) ? "windows" : "other";

/** 이 페이지로 돌아오는 초대 주소 — QR 과 Android 폴백이 쓴다. 앱이 없는 사람은 웹에서 같은 원정에 합류한다 */
export function inviteUrl(code: string): string {
  const c = cleanCode(code);
  return `${location.origin}${location.pathname}${c ? `?raid=${c}` : ""}`;
}

/** 앱을 여는 주소 — Android 는 intent(앱이 없으면 웹으로 돌아온다), Windows 는 giwa://. 앱이 없는 곳은 null */
export function appHref(code: string, online: boolean): string | null {
  const link = { server: online ? WS_URL : "", code: online ? cleanCode(code) : "" };
  if (PLATFORM === "other") return null;
  return PLATFORM === "android" ? intentLink(link, inviteUrl(link.code)) : buildLink(link);
}

/** 초대 링크(?raid=<코드>)로 들어왔으면 그 코드 */
export const INVITE_CODE = typeof location === "undefined" ? "" : cleanCode(new URLSearchParams(location.search).get("raid"));
