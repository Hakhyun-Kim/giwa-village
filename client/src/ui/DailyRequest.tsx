import { useEffect, useState } from "react";
import {
  DAILY_GOALS,
  chooseDaily,
  dailyStampCount,
  loadDaily,
  type DailyKind,
  type DailyState,
} from "../state/daily";
import { useStore } from "../state/store";

function onboardingDone(): boolean {
  try {
    const step = Number(localStorage.getItem("giwa-quest-step") ?? "0");
    return (
      localStorage.getItem("giwa-quest-complete") === "1" ||
      step >= 7 ||
      step >= 900
    );
  } catch {
    return false;
  }
}

export default function DailyRequest() {
  const [state, setState] = useState<DailyState>(() => loadDaily());
  const [visible, setVisible] = useState(onboardingDone);

  useEffect(() => {
    const sync = (e: Event) => {
      const next = (e as CustomEvent<DailyState>).detail;
      setState(next ?? loadDaily());
    };
    const quest = () => setVisible(onboardingDone());
    window.addEventListener("giwa-daily", sync);
    window.addEventListener("giwa-quest", quest);
    return () => {
      window.removeEventListener("giwa-daily", sync);
      window.removeEventListener("giwa-quest", quest);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      const next = loadDaily();
      setState((current) => (next.date === current.date ? current : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!visible) return null;

  if (!state.choice) {
    return (
      <div className="daily-card">
        <div className="daily-head">📅 오늘의 장터 부탁</div>
        <div className="daily-note">하나만 골라 오늘의 도장을 받으세요</div>
        <div className="daily-choices">
          {(Object.keys(DAILY_GOALS) as DailyKind[]).map((kind) => {
            const goal = DAILY_GOALS[kind];
            return (
              <button key={kind} onClick={() => setState(chooseDaily(kind))}>
                <span>{goal.emoji}</span>
                <b>{goal.title}</b>
                <em>{goal.objective}</em>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const goal = DAILY_GOALS[state.choice];
  return (
    <div className={`daily-card compact ${state.done ? "done" : ""}`}>
      <div className="daily-head">
        {state.done ? "✅ 오늘의 도장" : `${goal.emoji} ${goal.title}`}
      </div>
      <div className="daily-note">
        {state.done
          ? `완료! 지금까지 ${dailyStampCount()}일 기록`
          : `${goal.objective} · ${state.progress}/${goal.goal}`}
      </div>
      {state.done && (
        <button
          className="daily-reward"
          onClick={() => useStore.getState().setHonorsOpen(true)}
        >
          🎁 도장 기념 장신구 보기
        </button>
      )}
      {!state.done && (
        <div className="daily-progress">
          <i style={{ width: `${(state.progress / goal.goal) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
