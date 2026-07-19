import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { loadCoupons } from "../state/coupons";
import { localPos } from "../net/colyseus";

// RPG 퀘스트식 온보딩 — 촌장의 부탁.
// 무료로 할 수 있는 것부터 차례로 안내하고, 상태를 자동 감지해 완료 처리한다.
// 진행은 localStorage에 남아 재방문 시 이어진다.

const STORAGE_KEY = "giwa-quest-step";

interface QuestCtx {
  walked: number;
  viewedStall: boolean;
}

interface Quest {
  id: string;
  title: string;
  objective: string;
  flavor: string;
  hint: string;
  check: (s: ReturnType<typeof useStore.getState>, ctx: QuestCtx) => boolean;
}

const QUESTS: Quest[] = [
  {
    id: "walk",
    title: "마을 첫걸음",
    objective: "광장을 15걸음 걸어보기",
    flavor:
      "어서 오게, 나그네! 나는 이 장터의 촌장일세. 자네 지갑이 곧 자네 몸이라네 — 우선 몸 좀 풀어볼까?",
    hint: "W·A·S·D 키로 움직입니다",
    check: (_s, ctx) => ctx.walked >= 15,
  },
  {
    id: "browse",
    title: "저잣거리 구경",
    objective: "아무 노점이나 들여다보기",
    flavor:
      "저잣거리 좌판들이 보이는가? 주인이 자리를 비워도 노점은 마을에 남지. 뭘 파는지 구경이나 해보게.",
    hint: "노점(좌판)을 클릭하면 열립니다",
    check: (_s, ctx) => ctx.viewedStall,
  },
  {
    id: "sit",
    title: "모닥불의 온기",
    objective: "광장 모닥불에 앉아보기",
    flavor:
      "다리도 쉴 겸 모닥불에 앉아보게. 우리 마을 모닥불은 묘해서, 혼자선 안 되고 함께 쬐어야 온기가 쌓인다네 — 공짜일세!",
    hint: "🔥 모닥불 근처에서 X 키",
    check: (s) => s.selfSitting,
  },
  {
    id: "fund",
    title: "노잣돈 마련",
    objective: "테스트 ETH 준비하기",
    flavor:
      "장터에서 놀려면 노잣돈이 좀 필요하지. 걱정 말게, 진짜 돈이 아니라 테스트넷 동전이야.",
    hint: "좌상단 '테스트 ETH 받기' 포셋, 또는 🦊 내 지갑에서 충전",
    check: (s) => Number(s.balanceEth ?? 0) > 0,
  },
  {
    id: "buy",
    title: "첫 거래",
    objective: "노점에서 물건 하나 사보기",
    flavor:
      "이제 진짜 장이다! 마음에 드는 걸 하나 사보게. 대금은 에스크로가 지켜주고, 쿠폰은 자네 지갑에 새겨진다네.",
    hint: "노점 클릭 → 가격 버튼 · 흥정으로 값을 부를 수도",
    check: (s) => !!s.walletAddress && loadCoupons(s.walletAddress).length > 0,
  },
  {
    id: "open",
    title: "장사꾼 데뷔",
    objective: "내 노점 펴보기",
    flavor:
      "제법이야! 이번엔 자네가 장사꾼이 될 차례. 아무 데나 좌판을 펴보게 — 접속을 끊어도 노점은 남는다네.",
    hint: "우상단 🧺 노점 열기",
    check: (s) =>
      !!s.walletAddress &&
      s.stalls.some(
        (st) =>
          !st.brand &&
          st.ownerAddress.toLowerCase() === s.walletAddress!.toLowerCase(),
      ),
  },
  {
    id: "boss",
    title: "도깨비에 맞서라",
    objective: "장터 도깨비 한 대 때리기",
    flavor:
      "쉿— 광장의 도깨비가 보이나? 혼자선 어림없지만 다 같이 때리면 잡히지. 가서 한 대 갈겨주게!",
    hint: "🧿 도깨비 근처에서 R 키 (쿨다운 30초)",
    check: (s) => (s.boss?.myContrib ?? 0) > 0,
  },
];

const DONE_FLAVOR =
  "이제 자네도 어엿한 장터 사람일세! 👜 가방에서 '개점' 칭호를 받아 달고, 🏯 길드에 들어 백층 던전에도 올라보게. 토요일 21시 장날엔 꼭 오고!";

export default function QuestLog() {
  const [step, setStep] = useState<number>(() => {
    const v = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
    return Number.isFinite(v) ? v : 0;
  });
  const [expanded, setExpanded] = useState(true);
  const [justDone, setJustDone] = useState(false);
  const ctx = useRef<QuestCtx>({ walked: 0, viewedStall: false });
  const lastPos = useRef({ x: 0, z: 0, init: false });

  const dismissed = step >= 900;
  const finished = step >= QUESTS.length && !dismissed;
  const quest = QUESTS[step];

  // 상태 자동 감지 루프
  useEffect(() => {
    if (dismissed || step >= QUESTS.length) return;
    const id = setInterval(() => {
      // 이동 거리 누적
      if (localPos.ready) {
        if (!lastPos.current.init) {
          lastPos.current = { x: localPos.x, z: localPos.z, init: true };
        } else {
          const d = Math.hypot(
            localPos.x - lastPos.current.x,
            localPos.z - lastPos.current.z,
          );
          if (d > 0.05 && d < 10) ctx.current.walked += d;
          lastPos.current.x = localPos.x;
          lastPos.current.z = localPos.z;
        }
      }
      const s = useStore.getState();
      if (s.stallView) ctx.current.viewedStall = true;

      const q = QUESTS[step];
      if (q && q.check(s, ctx.current)) {
        setJustDone(true);
        setTimeout(() => {
          setJustDone(false);
          const next = step + 1;
          setStep(next);
          localStorage.setItem(STORAGE_KEY, String(next));
          setExpanded(true);
        }, 1700);
        clearInterval(id);
      }
    }, 800);
    return () => clearInterval(id);
  }, [step, dismissed]);

  // 쇼케이스 중에는 숨긴다
  if (new URLSearchParams(location.search).get("showcase") === "1") return null;
  if (dismissed) return null;

  function skip() {
    setStep(900);
    localStorage.setItem(STORAGE_KEY, "900");
  }

  if (finished) {
    return (
      <div className="quest-card quest-done">
        <div className="quest-head" onClick={() => setExpanded((v) => !v)}>
          <span className="quest-npc">🧓</span>
          <b>촌장의 부탁 — 완료!</b>
          <button className="quest-skip" onClick={skip}>
            ✕
          </button>
        </div>
        {expanded && <div className="quest-flavor">“{DONE_FLAVOR}”</div>}
      </div>
    );
  }

  return (
    <div className={`quest-card ${justDone ? "quest-clear" : ""}`}>
      <div className="quest-head" onClick={() => setExpanded((v) => !v)}>
        <span className="quest-npc">🧓</span>
        <b>
          촌장의 부탁 {step + 1}/{QUESTS.length}
        </b>
        <span className="quest-toggle">{expanded ? "▾" : "▸"}</span>
        <button className="quest-skip" onClick={skip} title="온보딩 건너뛰기">
          숙련자
        </button>
      </div>
      <div className="quest-title">
        {justDone ? "✅ 완료! 잘했네!" : `📜 ${quest.title}`}
      </div>
      {!justDone && (
        <div className="quest-objective">▸ {quest.objective}</div>
      )}
      {expanded && !justDone && (
        <>
          <div className="quest-flavor">“{quest.flavor}”</div>
          <div className="quest-hint">💡 {quest.hint}</div>
        </>
      )}
    </div>
  );
}
