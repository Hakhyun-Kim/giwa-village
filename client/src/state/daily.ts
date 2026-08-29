// 오늘의 장터 부탁 — KST 날짜별로 하나를 고르고, 무료 행동으로 도장을 받는다.
// 로컬 기록은 보상이 아니라 재방문 리듬을 위한 개인 체크리스트다.

export type DailyKind = "greet" | "browse" | "craft";

export interface DailyState {
  date: string;
  choice: DailyKind | null;
  progress: number;
  done: boolean;
  tokens: string[];
}

const PREFIX = "giwa-daily-";

export const DAILY_GOALS: Record<
  DailyKind,
  { emoji: string; title: string; objective: string; goal: number }
> = {
  greet: {
    emoji: "🙇",
    title: "인사꾼의 부탁",
    objective: "주민에게 이모트 3번 보내기",
    goal: 3,
  },
  browse: {
    emoji: "🧺",
    title: "구경꾼의 부탁",
    objective: "노점 2곳 들여다보기",
    goal: 2,
  },
  craft: {
    emoji: "🎨",
    title: "장인의 부탁",
    objective: "문양 공방에서 8칸 칠하기",
    goal: 8,
  },
};

export function kstDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function key(date: string): string {
  return `${PREFIX}${date}`;
}

export function loadDaily(date = kstDate()): DailyState {
  const empty: DailyState = { date, choice: null, progress: 0, done: false, tokens: [] };
  try {
    const raw = localStorage.getItem(key(date));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<DailyState>;
    const choice =
      parsed.choice && parsed.choice in DAILY_GOALS
        ? (parsed.choice as DailyKind)
        : null;
    return {
      date,
      choice,
      progress: Math.max(0, Number(parsed.progress) || 0),
      done: !!parsed.done,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.filter((v): v is string => typeof v === "string") : [],
    };
  } catch {
    return empty;
  }
}

function saveDaily(state: DailyState): void {
  try {
    localStorage.setItem(key(state.date), JSON.stringify(state));
  } catch {
    /* 저장소를 못 써도 이번 세션 플레이는 계속된다 */
  }
  window.dispatchEvent(new CustomEvent("giwa-daily", { detail: state }));
}

export function chooseDaily(choice: DailyKind): DailyState {
  const state = loadDaily();
  if (!state.choice) {
    state.choice = choice;
    saveDaily(state);
  }
  return state;
}

export function recordDaily(kind: DailyKind, amount = 1, token?: string): void {
  const state = loadDaily();
  if (state.done || state.choice !== kind) return;
  if (token && state.tokens.includes(token)) return;
  if (token) state.tokens.push(token);
  const goal = DAILY_GOALS[kind].goal;
  state.progress = Math.min(goal, state.progress + amount);
  state.done = state.progress >= goal;
  saveDaily(state);
}

export function dailyStampCount(): number {
  try {
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const value = JSON.parse(localStorage.getItem(k) ?? "null") as
        | Partial<DailyState>
        | null;
      if (value?.done) count++;
    }
    return count;
  } catch {
    return 0;
  }
}
