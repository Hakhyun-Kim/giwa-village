// 지금 촌장의 부탁이 가리키는 한 걸음 — QuestLog 가 적고, 주민과 놀기 창이 읽는다.
// 매 프레임 바뀌는 값이 아니고 화면 하나만 읽으므로 zustand 에 넣지 않고 평범한 변수로 둔다.
export interface QuestStep {
  title: string;
  hint: string;
}

let now: QuestStep | null = null;

export function setQuestNow(step: QuestStep | null): void {
  now = step;
}

export function questNow(): QuestStep | null {
  return now;
}
