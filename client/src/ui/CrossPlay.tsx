import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { cleanCode } from "../../../shared/crosslink";
import { appHref, inviteUrl, PLATFORM } from "../net/crossplay";
import { useWorld } from "../state/world";

// 크로스플레이 — 웹에서 연 원정을 Unity 앱(휴대폰) · PC 게임이 이어받는다(PROTOCOL.md §3.8).
// 링크에는 룸 서버와 입장 코드만 싣는다. 지갑은 넘기지 않는다 — 앱은 제 버너로 선다.
// 떠나라고 밀지 않는다: 버튼 하나를 더 둘 뿐이고, 웹의 원정은 그대로 된다.

function QrCode({ text, size = 132 }: { text: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { d, n: n + 8 };
  }, [text]);
  return <svg className="qr-code" width={size} height={size} viewBox={`0 0 ${path.n} ${path.n}`} shapeRendering="crispEdges" role="img" aria-label="원정 초대 QR">
    <rect width={path.n} height={path.n} fill="#fff"/><path d={path.d} fill="#000"/>
  </svg>;
}

/** 원정 카드에 붙는 줄 — code 가 있으면(실시간 원정 안) 휴대폰 초대 QR 까지 */
export default function CrossPlay({ code = "" }: { code?: string }) {
  const online = useWorld(s => s.server) === "online";
  const [qr, setQr] = useState(false);
  const href = appHref(code, online);
  const invite = online && cleanCode(code) ? inviteUrl(code) : "";
  if (!href && !invite) return null;
  const label = PLATFORM === "android" ? "Unity 앱으로" : "PC 게임으로";
  return <div className="cross-play">
    {href && <a className="cross-play-app" href={href}>{code ? `${label} 합류` : `${label} 원정`} ↗</a>}
    {invite && <button onClick={() => setQr(v => !v)}>{qr ? "QR 닫기" : "휴대폰으로 합류 · QR"}</button>}
    {qr && invite && <div className="cross-play-qr"><QrCode text={invite}/><small>휴대폰 카메라로 찍으면 같은 원정에 들어옵니다. 앱이 있으면 앱으로, 없으면 웹으로.</small></div>}
    {href && !qr && <small className="cross-play-note">{PLATFORM === "android" ? "앱이 없으면 이 페이지로 돌아옵니다." : "게임이 설치되어 있지 않으면 아무 일도 일어나지 않아요 — 여기서 계속하면 됩니다."}{!online && " 서버가 없어 앱에서는 혼자 연습 원정이 열립니다."}</small>}
  </div>;
}
