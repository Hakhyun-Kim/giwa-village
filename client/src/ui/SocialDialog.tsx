import { useStore } from "../state/store";
import { performSocialEmote, SOCIAL_EMOTES } from "../game/social";
import { nextStepLine } from "../demo/chatter";
import { questNow } from "../state/questNow";

export default function SocialDialog() {
  const targetId = useStore((s) => s.socialTarget);
  const target = useStore((s) => (targetId ? s.players[targetId] : null));
  if (!targetId || !target) return null;
  const targetAddress = target.address;
  // 마을 주민(npc-*)은 촌장의 부탁이 가리키는 다음 한 걸음을 건넨다 — 다른 사람은 아니다
  const tip = targetId.startsWith("npc-") ? nextStepLine(questNow()) : null;

  function close() {
    useStore.getState().setSocialTarget(null);
  }

  function gift() {
    if (!targetId || !targetAddress) return;
    close();
    useStore.getState().setGiftTarget(targetId);
  }

  return (
    <div className="gift-overlay" onClick={close}>
      <div className="gift-modal social-modal" onClick={(e) => e.stopPropagation()}>
        <div className="gift-emoji">👥</div>
        <div className="gift-title">{target.name} 님과 놀기</div>
        <div className="gift-sub">
          가까이서 같은 동작을 맞추면 <b>합동 장단</b>이 뜹니다
        </div>
        {tip && (
          <div className="gift-note social-tip">
            🗣 {target.name}: “{tip}”
          </div>
        )}
        <div className="social-emotes">
          {SOCIAL_EMOTES.map((emote) => (
            <button
              key={emote.icon}
              className="social-emote"
              onClick={() => {
                performSocialEmote(emote.icon, targetId);
                close();
              }}
            >
              <span>{emote.icon}</span>
              {emote.label}
            </button>
          ))}
        </div>
        <div className="gift-actions">
          <button className="gift-btn" onClick={close}>닫기</button>
          {targetAddress && (
            <button className="gift-btn primary" onClick={gift}>🎁 선물</button>
          )}
        </div>
      </div>
    </div>
  );
}
