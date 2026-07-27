// 다이얼로그 여닫는 소리 — 한 곳에서만 건다.
//
// 다이얼로그마다 손으로 소리를 붙이면, 나중에 추가되는 창은 반드시 빠뜨린다.
// 지갑 쓰기를 queueTx 하나로 모은 것과 같은 이유로, "무엇이든 열렸다/닫혔다"를
// 스토어에서 한 번만 보고 소리를 낸다. 새 창을 만들면 아래 목록에 이름만 더하면 된다.

import { useStore } from "../state/store";
import { sfxClose, sfxOpen } from "./sfx";

type Store = ReturnType<typeof useStore.getState>;

const PANELS: (keyof Store)[] = [
  "stallView",
  "stallOpenDialog",
  "couponsOpen",
  "guildOpen",
  "dungeonOpen",
  "honorsOpen",
  "ledgerOpen",
  "workshopOpen",
  "giftTarget",
];

const anyOpen = (s: Store) => PANELS.some((k) => !!s[k]);

/** 앱 시작에 한 번. 구독 해제 함수를 돌려준다 */
export function watchPanels(): () => void {
  let was = anyOpen(useStore.getState());
  return useStore.subscribe((s) => {
    const now = anyOpen(s);
    if (now === was) return;
    was = now;
    if (now) sfxOpen();
    else sfxClose();
  });
}
