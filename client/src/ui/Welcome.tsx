import { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { startShowcase } from "../demo/showcase";

// 첫 방문자에게 한 번만 묻는다 — "자동으로 둘러볼까요?"
//
// 처음 들어온 사람은 무엇을 눌러야 할지 모른다. 촌장의 부탁(온보딩)이 있지만
// 그건 *하는 법*을 알려주는 것이고, 이 카드는 *무엇이 있는지*를 먼저 보여준다.
// 고르든 안 고르든 답은 localStorage에 남아 다시 묻지 않는다.

const STORAGE_KEY = "giwa-welcome";
const QUEST_KEY = "giwa-quest-step"; // 이미 온보딩을 시작한 사람은 첫 방문자가 아니다

function seenBefore(): boolean {
  try {
    return (
      localStorage.getItem(STORAGE_KEY) !== null ||
      localStorage.getItem(QUEST_KEY) !== null
    );
  } catch {
    return true; // 저장소를 못 쓰면 묻지 않는다 (사파리 프라이빗 등)
  }
}

function remember(answer: "tour" | "self") {
  try {
    localStorage.setItem(STORAGE_KEY, answer);
  } catch {
    /* 저장 못 해도 이번 세션은 그대로 진행한다 */
  }
}

export default function Welcome() {
  const params = new URLSearchParams(location.search);
  // ?showcase=1은 이미 자동 시연이고, ?slot=은 개발용 듀얼 테스트 창이다
  const suppressed = params.get("showcase") === "1" || !!params.get("slot");
  const [asking, setAsking] = useState(() => !suppressed && !seenBefore());
  const status = useStore((s) => s.status);
  const [ready, setReady] = useState(false);

  // 마을이 다 뜬 뒤에 묻는다 — 로딩 화면 위에 얹히면 무슨 선택인지 알 수 없다
  useEffect(() => {
    if (!asking || status !== "connected") return;
    const id = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(id);
  }, [asking, status]);

  if (!asking || !ready) return null;

  function choose(answer: "tour" | "self") {
    remember(answer);
    setAsking(false);
    if (answer === "tour") startShowcase();
  }

  return (
    <div className="welcome-card">
      <div className="welcome-head">
        <span className="welcome-npc">🧓</span>
        <b>어서 오게, 나그네!</b>
      </div>
      <div className="welcome-body">
        여기는 <b>기와장터</b> — 지갑이 곧 자네 몸이고, 노점이 곧 장사일세.
        처음이라면 내가 마을을 한 바퀴 <b>대신 걸어서</b> 보여주겠네.
      </div>
      <div className="welcome-actions">
        <button className="welcome-yes" onClick={() => choose("tour")}>
          🎬 자동으로 둘러보기
        </button>
        <button className="welcome-no" onClick={() => choose("self")}>
          🚶 직접 걸어볼래요
        </button>
      </div>
      <div className="welcome-note">
        시연 중 언제든 <b>ESC</b>로 멈추고 직접 조작할 수 있습니다 · 테스트 ETH가
        없으면 가스가 들지 않는 구경 모드로 보여드립니다
      </div>
    </div>
  );
}
