import { useState } from "react";
import { fieldWalk, useWorld } from "../state/world";
import { goField } from "../net/expedition";
import { useStore } from "../state/store";
import { appHref, INVITE_CODE, PLATFORM } from "../net/crossplay";

// 초대 링크(?raid=<코드>)로 들어온 사람 — 동료의 QR 을 찍었거나, 앱이 없어 Android 폴백으로 돌아왔다.
// 앱으로 이어 갈지, 웹에서 합류할지 한 번 고른다. 이 카드가 떠 있는 동안 첫 방문 카드(Welcome)는 묻지 않는다.

export default function RaidInvite() {
  const [open, setOpen] = useState(!!INVITE_CODE);
  const world = useWorld();
  const showcasing = useStore(s => s.showcasing);
  if (!open || showcasing || world.zone !== "village") return null;
  const online = world.server === "online";
  const href = appHref(INVITE_CODE, online);
  function joinOnWeb() {
    setOpen(false);
    useWorld.setState({ inviteCode: INVITE_CODE });
    goField("동료의 원정 코드를 받아 두었어요. 다솔을 따라 산채 입구에서 '동료에게 합류'를 누르세요.");
    fieldWalk.active = true;
  }
  return <section className="raid-invite" role="dialog" aria-label="원정 초대">
    <small>솔바람 산채 · 원정 초대</small>
    <h2>동료가 부르고 있어요</h2>
    <p>입장 코드 <b>{INVITE_CODE}</b>{!online && world.server === "offline" && " · 지금은 실시간 서버에 닿지 않아 합류할 수 없어요."}</p>
    <div className="raid-invite-actions">
      {href && online && <a className="cross-play-app" href={href} onClick={() => setOpen(false)}>{PLATFORM === "android" ? "Unity 앱으로 합류" : "PC 게임으로 합류"} ↗</a>}
      <button disabled={!online} onClick={joinOnWeb}>웹에서 합류</button>
      <button onClick={() => setOpen(false)}>나중에</button>
    </div>
  </section>;
}
