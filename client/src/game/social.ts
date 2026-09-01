import { localPos, sendEmote } from "../net/colyseus";
import { useStore, remoteTargets } from "../state/store";
import { recordDaily } from "../state/daily";

export const SOCIAL_EMOTES = [
  { icon: "👋", label: "인사" },
  { icon: "🙇", label: "절" },
  { icon: "👏", label: "박수" },
  { icon: "💃", label: "춤" },
  { icon: "🍻", label: "건배" },
] as const;

function clearLater(id: string, at: number, kind: "emote" | "say", ms: number) {
  setTimeout(() => {
    const s = useStore.getState();
    if (kind === "emote") s.clearEmote(id, at);
    else s.clearSay(id, at);
  }, ms);
}

/** 즉시 내 화면에 반응하고, 서버/체인 비컨에는 같은 이모트를 전파한다. */
export function performSocialEmote(icon: string, targetId?: string): void {
  const s = useStore.getState();
  const selfId = s.selfId;
  if (!selfId) return;

  sendEmote(icon);
  s.setEmote(selfId, icon);
  const at = useStore.getState().emotes[selfId]?.at;
  if (at) clearLater(selfId, at, "emote", 2400);
  const nearby = Object.keys(s.players).filter((id) => {
    const p = remoteTargets.get(id);
    return !!p && Math.hypot(p.x - localPos.x, p.z - localPos.z) <= 6;
  });
  const candidates = targetId ? [targetId] : nearby;
  // 일일 인사는 실제 주민을 향했을 때만 센다. 광장에서 혼자 E를 연타한 것은 제외한다.
  if (candidates.some((id) => id in s.players)) recordDaily("greet");
  const partner = candidates.find((id) => {
    if (s.emotes[id]?.icon !== icon) return false;
    const p = remoteTargets.get(id);
    return !!p && Math.hypot(p.x - localPos.x, p.z - localPos.z) <= 4;
  });
  if (!partner) return;

  // 같은 동작을 가까이서 맞추면 양쪽에 합동 반응을 띄운다. 새 메시나 파티클은 없다.
  for (const id of [selfId, partner]) {
    s.setSay(id, "✨ 합동 장단!");
    const sayAt = useStore.getState().says[id]?.at;
    if (sayAt) clearLater(id, sayAt, "say", 2600);
  }
}
