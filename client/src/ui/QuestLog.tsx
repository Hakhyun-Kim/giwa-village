import { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import { loadCoupons } from "../state/coupons";
import { localPos } from "../net/colyseus";

const STORAGE_KEY = "giwa-quest-step";
const PATH_KEY = "giwa-quest-path";
const COMPLETE_KEY = "giwa-quest-complete";
const VERSION_KEY = "giwa-quest-version";

type QuestPath = "merchant" | "expedition" | "artisan";

interface QuestCtx {
  walked: number;
  viewedStall: boolean;
  painted: number;
}

interface Quest {
  id: string;
  title: string;
  objective: string;
  flavor: string;
  hint: string;
  check: (s: ReturnType<typeof useStore.getState>, ctx: QuestCtx) => boolean;
}

const TOUCH =
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

const FREE_QUESTS: Quest[] = [
  {
    id: "walk",
    title: "마을 첫걸음",
    objective: "광장을 15m 걸어보기",
    flavor: "어서 오게, 나그네! 자네 지갑이 곧 자네 몸이라네 — 우선 몸 좀 풀어볼까?",
    hint: TOUCH ? "왼쪽 아래 조이스틱으로 움직입니다" : "W·A·S·D 키로 움직입니다",
    check: (_s, ctx) => ctx.walked >= 15,
  },
  {
    id: "browse",
    title: "저잣거리 구경",
    objective: "아무 노점이나 들여다보기",
    flavor: "주인이 자리를 비워도 노점은 마을에 남지. 뭘 파는지 구경이나 해보게.",
    hint: "노점(좌판)을 클릭하면 열립니다",
    check: (_s, ctx) => ctx.viewedStall,
  },
  {
    id: "sit",
    title: "모닥불의 온기",
    objective: "광장 모닥불에 앉아보기",
    flavor: "혼자선 안 되고 함께 쬐어야 온기가 쌓인다네. 앉는 데는 노잣돈도 필요 없지.",
    hint: TOUCH ? "🔥 모닥불 근처에서 '앉기' 버튼" : "🔥 모닥불 근처에서 X 키",
    check: (s) => s.selfSitting,
  },
];

const FUND: Quest = {
  id: "fund",
  title: "노잣돈 마련",
  objective: "테스트 ETH 준비하기",
  flavor: "이 길은 체인에 기록을 남긴다네. 진짜 돈이 아니라 테스트넷 동전이야.",
  hint: "좌상단 '테스트 ETH 받기' 포셋, 또는 🦊 내 지갑에서 충전",
  check: (s) => Number(s.balanceEth ?? 0) > 0,
};

const PATHS: Record<
  QuestPath,
  { emoji: string; name: string; desc: string; quests: Quest[]; done: string }
> = {
  merchant: {
    emoji: "🧺",
    name: "장사꾼의 길",
    desc: "사고, 흥정하고, 내 노점을 편다",
    quests: [
      FUND,
      {
        id: "buy",
        title: "첫 거래",
        objective: "노점에서 물건 하나 사보기",
        flavor: "마음에 드는 걸 하나 사보게. 흥정으로 먼저 값을 불러도 좋고!",
        hint: "노점 클릭 → 가격 버튼 · 흥정으로 값을 제안할 수도",
        check: (s) => !!s.walletAddress && loadCoupons(s.walletAddress).length > 0,
      },
      {
        id: "open",
        title: "장사꾼 데뷔",
        objective: "내 노점 펴보기",
        flavor: "이번엔 자네가 장사꾼이 될 차례. 접속을 끊어도 노점은 남는다네.",
        hint: "우상단 🧺 노점 열기",
        check: (s) =>
          !!s.walletAddress &&
          s.stalls.some(
            (st) =>
              !st.brand &&
              st.ownerAddress.toLowerCase() === s.walletAddress!.toLowerCase(),
          ),
      },
    ],
    done: "이제 자네도 어엿한 장터 상인일세! 흥정과 장부도 살펴보게.",
  },
  expedition: {
    emoji: "🧿",
    name: "원정대의 길",
    desc: "도깨비와 맞서고 백층 던전을 찾는다",
    quests: [
      {
        id: "meet-boss",
        title: "도깨비 대면",
        objective: "광장의 도깨비 곁으로 가보기",
        flavor: "먼저 적의 얼굴부터 보게. 가까이 가면 풍류도 토벌 장단으로 바뀐다네.",
        hint: "🧿 광장 북동쪽의 도깨비에게 다가갑니다",
        check: (s) => s.nearBoss,
      },
      FUND,
      {
        id: "boss",
        title: "도깨비에 맞서라",
        objective: "도깨비 한 대 때리기",
        flavor: "혼자선 어림없지만 다 같이 때리면 잡히지. 한 대 갈겨주게!",
        hint: TOUCH ? "도깨비 근처에서 '타격' 버튼" : "도깨비 근처에서 R 키",
        check: (s) => (s.boss?.myContrib ?? 0) > 0,
      },
      {
        id: "portal",
        title: "백층 던전의 문",
        objective: "북쪽 포털을 찾아가기",
        flavor: "길드원들은 서로 다른 시간에도 같은 원정을 이어 오를 수 있다네.",
        hint: "⚔ 북쪽 포털에 다가가 F 키 또는 던전 버튼",
        check: (s) => s.nearPortal || s.dungeonOpen,
      },
    ],
    done: "원정대 자격은 충분하네! 길드에 들어 동료들의 층수를 이어 올려보게.",
  },
  artisan: {
    emoji: "🎨",
    name: "장인의 길",
    desc: "문양을 만들고 나만의 차림을 고른다",
    quests: [
      {
        id: "workshop",
        title: "문양 공방 구경",
        objective: "가방에서 문양 공방 열기",
        flavor: "장터에는 파는 사람만 있는 게 아니지. 무늬를 만드는 장인도 필요하다네.",
        hint: "우상단 👜 가방 → 🎨 문양 공방",
        check: (s) => s.workshopOpen,
      },
      {
        id: "paint",
        title: "첫 붓질",
        objective: "문양을 8칸 칠해보기",
        flavor: "작은 점 여덟 개면 자네만의 표식이 시작되지. 등록 전까지는 공짜일세.",
        hint: "공방의 8×8 격자를 누르거나 드래그합니다",
        check: (_s, ctx) => ctx.painted >= 8,
      },
      {
        id: "honors",
        title: "차림새 고르기",
        objective: "칭호·장신구함 열어보기",
        flavor: "게임에서 얻은 칭호와 장신구는 팔 수 없지만, 자랑은 실컷 할 수 있지.",
        hint: "우상단 👜 가방 → 🎖 칭호·장신구",
        check: (s) => s.honorsOpen,
      },
    ],
    done: "장인의 눈을 얻었군! 문양을 등록하거나 장신구를 달아 자네 차림을 완성해보게.",
  },
};

function savedStep(): number {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function savedPath(step: number): QuestPath | null {
  try {
    const value = localStorage.getItem(PATH_KEY);
    if (value && value in PATHS) return value as QuestPath;
    const version = localStorage.getItem(VERSION_KEY);
    if (!version && step >= FREE_QUESTS.length && step < 900) {
      localStorage.setItem(PATH_KEY, "merchant");
      localStorage.setItem(VERSION_KEY, "2");
      return "merchant";
    }
    if (!version) localStorage.setItem(VERSION_KEY, "2");
  } catch {
    /* 새로 고르게 둔다 */
  }
  return null;
}

export default function QuestLog() {
  const initialStep = savedStep();
  const [step, setStep] = useState(initialStep);
  const [path, setPath] = useState<QuestPath | null>(() => savedPath(initialStep));
  const [expanded, setExpanded] = useState(true);
  const [justDone, setJustDone] = useState(false);
  const showcasing = useStore((s) => s.showcasing);
  const ctx = useRef<QuestCtx>({ walked: 0, viewedStall: false, painted: 0 });
  const lastPos = useRef({ x: 0, z: 0, init: false });

  const dismissed = step >= 900;
  const quests = path ? [...FREE_QUESTS, ...PATHS[path].quests] : FREE_QUESTS;
  const choosing = !dismissed && step >= FREE_QUESTS.length && !path;
  const finished = !dismissed && !!path && step >= quests.length;
  const quest = quests[step];

  useEffect(() => {
    const paint = () => ctx.current.painted++;
    window.addEventListener("giwa-workshop-paint", paint);
    return () => window.removeEventListener("giwa-workshop-paint", paint);
  }, []);

  useEffect(() => {
    if (dismissed || choosing || finished || !quest) return;
    const id = setInterval(() => {
      if (localPos.ready) {
        if (!lastPos.current.init) {
          lastPos.current = { x: localPos.x, z: localPos.z, init: true };
        } else {
          const distance = Math.hypot(
            localPos.x - lastPos.current.x,
            localPos.z - lastPos.current.z,
          );
          if (distance > 0.05 && distance < 10) ctx.current.walked += distance;
          lastPos.current.x = localPos.x;
          lastPos.current.z = localPos.z;
        }
      }
      const state = useStore.getState();
      if (state.stallView) ctx.current.viewedStall = true;
      if (!quest.check(state, ctx.current)) return;

      setJustDone(true);
      clearInterval(id);
      setTimeout(() => {
        const next = step + 1;
        setJustDone(false);
        setStep(next);
        localStorage.setItem(STORAGE_KEY, String(next));
        if (next >= quests.length) localStorage.setItem(COMPLETE_KEY, "1");
        window.dispatchEvent(new Event("giwa-quest"));
        setExpanded(true);
      }, 1700);
    }, 800);
    return () => clearInterval(id);
  }, [step, dismissed, choosing, finished, quest, quests.length]);

  if (showcasing || dismissed) return null;

  function skip() {
    setStep(900);
    localStorage.setItem(STORAGE_KEY, "900");
    localStorage.setItem(COMPLETE_KEY, "1");
    window.dispatchEvent(new Event("giwa-quest"));
  }

  function choosePath(next: QuestPath) {
    setPath(next);
    localStorage.setItem(PATH_KEY, next);
    localStorage.setItem(VERSION_KEY, "2");
    localStorage.setItem(STORAGE_KEY, String(FREE_QUESTS.length));
  }

  if (choosing) {
    return (
      <div className="quest-card quest-path-card">
        <div className="quest-head">
          <span className="quest-npc">🧓</span>
          <b>촌장의 부탁 — 자네의 길은?</b>
          <button className="quest-skip" onClick={skip}>숙련자</button>
        </div>
        <div className="quest-flavor">“하고 싶은 것부터 골라보게. 다른 길은 언제든 마을에서 즐길 수 있네.”</div>
        <div className="quest-paths">
          {(Object.keys(PATHS) as QuestPath[]).map((key) => (
            <button key={key} onClick={() => choosePath(key)}>
              <span>{PATHS[key].emoji}</span>
              <b>{PATHS[key].name}</b>
              <em>{PATHS[key].desc}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (finished && path) {
    return (
      <div className="quest-card quest-done">
        <div className="quest-head" onClick={() => setExpanded((v) => !v)}>
          <span className="quest-npc">🧓</span>
          <b>촌장의 부탁 — {PATHS[path].name} 완료!</b>
          <button className="quest-skip" onClick={skip}>✕</button>
        </div>
        {expanded && <div className="quest-flavor">“{PATHS[path].done}”</div>}
      </div>
    );
  }

  if (!quest) return null;
  return (
    <div className={`quest-card ${justDone ? "quest-clear" : ""}`}>
      <div className="quest-head" onClick={() => setExpanded((v) => !v)}>
        <span className="quest-npc">🧓</span>
        <b>촌장의 부탁 {step + 1}/{quests.length}</b>
        <span className="quest-toggle">{expanded ? "▾" : "▸"}</span>
        <button className="quest-skip" onClick={skip} title="온보딩 건너뛰기">숙련자</button>
      </div>
      <div className="quest-title">
        {justDone ? "✅ 완료! 잘했네!" : `📜 ${quest.title}`}
      </div>
      {!justDone && <div className="quest-objective">▸ {quest.objective}</div>}
      {expanded && !justDone && (
        <>
          <div className="quest-flavor">“{quest.flavor}”</div>
          <div className="quest-hint">💡 {quest.hint}</div>
        </>
      )}
    </div>
  );
}
