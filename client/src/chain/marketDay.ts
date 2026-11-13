// 장날 (토요일 21:00 KST = 12:00 UTC, 1시간) — 지갑 · 체인을 모르는 순수 모듈.
// 판정식은 컨트랙트(GiwaHearth.isMarketDay)와 같다 — test:local 이 표본 64개로 대조하고,
// 문구(남은 시간)는 npm test 가 경계 시각으로 걸어 본다.

const HOUR = 3600;
const START = 12 * HOUR; // UTC 12:00 = KST 21:00
const LENGTH = HOUR;

export function isMarketDayNow(now = Date.now()): boolean {
  const ts = Math.floor(now / 1000);
  const day = Math.floor(ts / 86400);
  const sec = ts % 86400;
  return day % 7 === 2 && sec >= 12 * 3600 && sec < 13 * 3600;
}

/** 다음 장날 시작까지 남은 ms (장날 중이면 0) */
export function msToMarketDay(now = Date.now()): number {
  if (isMarketDayNow(now)) return 0;
  const ts = Math.floor(now / 1000);
  const day = Math.floor(ts / 86400);
  for (let d = 0; d < 8; d++) {
    if ((day + d) % 7 === 2) {
      const start = (day + d) * 86400 + START;
      if (start * 1000 > now) return start * 1000 - now;
    }
  }
  return 0;
}

/** 열린 장날이 닫힐 때까지 남은 ms (장날이 아니면 0) */
export function msToMarketDayEnd(now = Date.now()): number {
  if (!isMarketDayNow(now)) return 0;
  const day = Math.floor(now / 1000 / 86400);
  return (day * 86400 + START + LENGTH) * 1000 - now;
}

export function marketDayLabel(now = Date.now()): string {
  if (isMarketDayNow(now)) {
    // 열린 동안에는 언제 닫히는지가 궁금하다 — 마지막 몇 분에 모닥불로 달려올 이유가 된다
    return `🏮 장날이 열렸습니다! (온기 2배 · ${Math.ceil(msToMarketDayEnd(now) / 60000)}분 남음)`;
  }
  const ms = msToMarketDay(now);
  const h = Math.floor(ms / 3600000);
  if (h >= 24) return `🏮 장날까지 ${Math.floor(h / 24)}일 ${h % 24}시간`;
  // 한 시간 안쪽은 분만 — "0시간 0분"이 아니라 올림해서 "1분"으로
  if (h === 0) return `🏮 장날까지 ${Math.ceil(ms / 60000)}분`;
  const m = Math.floor((ms % 3600000) / 60000);
  return `🏮 장날까지 ${h}시간 ${m}분`;
}
