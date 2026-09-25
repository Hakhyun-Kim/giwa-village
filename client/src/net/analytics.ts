// 계측 — guide/ANALYTICS.md 의 스키마를 웹에서 보내는 곳. 모든 클라이언트가 같은 이름을 쓴다.
//
// 빌드할 때 VITE_ANALYTICS_KEY 가 없으면 아무것도 하지 않는다(기본값 · 공개 데모 · smoke).
// 있으면 PostHog 호환 batch(`${VITE_ANALYTICS_HOST}/batch/`)로 모아 보낸다. 외부 의존성 0.
//
// 프라이버시 규칙(스키마 문서와 같다):
// - 식별자는 설치마다 무작위(install_id). 주소 · 주소 해시 · tx 해시 · 키는 싣지 않는다.
// - 혹시 속성에 0x 로 시작하는 긴 16진이 섞여 들어오면 보내기 전에 지운다.
// - 자동화(navigator.webdriver — smoke:boot 의 Playwright)와 ?noanalytics 에서는 꺼진다.

const KEY: string | undefined = import.meta.env.VITE_ANALYTICS_KEY || undefined;
const HOST: string = (import.meta.env.VITE_ANALYTICS_HOST || "https://us.i.posthog.com").replace(/\/+$/, "");
const BUILD: string = import.meta.env.VITE_BUILD || import.meta.env.MODE;

const INSTALL_KEY = "giwa-install-id";
const INVITE_KEY = "giwa-invite";
const FLUSH_MS = 10_000;
const MAX_BATCH = 20;

type Props = Record<string, string | number | boolean | null | undefined>;

function automated(): boolean {
  try {
    return navigator.webdriver === true || new URLSearchParams(location.search).has("noanalytics");
  } catch {
    return true;
  }
}

export const analyticsOn: boolean = !!KEY && typeof window !== "undefined" && !automated();

function stored(key: string, make: () => string | null): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const n = make();
    if (n) localStorage.setItem(key, n);
    return n;
  } catch {
    return make();
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** ?invite=<토큰> — 처음 본 것을 남겨 두고 이후 모든 이벤트에 싣는다 */
function inviteToken(): string | null {
  let fromUrl: string | null = null;
  try {
    fromUrl = new URLSearchParams(location.search).get("invite");
  } catch {
    /* 없음 */
  }
  const clean = fromUrl && /^[A-Za-z0-9_-]{1,32}$/.test(fromUrl) ? fromUrl : null;
  try {
    const prev = localStorage.getItem(INVITE_KEY);
    if (prev) return prev;
    if (clean) localStorage.setItem(INVITE_KEY, clean);
  } catch {
    /* 저장 못 해도 이번 세션에는 싣는다 */
  }
  return clean;
}

const HEX = /0x[0-9a-fA-F]{8,}/g;
function scrub(v: Props[string]): Props[string] {
  return typeof v === "string" ? v.replace(HEX, "0x…").slice(0, 120) : v;
}

let installId = "";
let invite: string | null = null;
const sessionId = randomId();
const bootAt = typeof performance !== "undefined" ? performance.now() : 0;
let queue: object[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const once = new Set<string>();

function send(keepalive = false) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || !KEY) return;
  const batch = queue;
  queue = [];
  // text/plain — CORS 사전 요청 없이 보낸다. 실패하면 버린다(계측 때문에 마을이 느려지면 안 된다)
  void fetch(`${HOST}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ api_key: KEY, batch }),
    keepalive,
  }).catch(() => {});
}

/** 이벤트 하나. 이름과 속성은 guide/ANALYTICS.md 의 표에 있는 것만 쓴다. */
export function track(event: string, props: Props = {}): void {
  if (!analyticsOn) return;
  const properties: Props = {
    distinct_id: installId,
    install_id: installId,
    session_id: sessionId,
    platform: "web",
    build: BUILD,
    invite_token: invite,
    $process_person_profile: false,
  };
  for (const [k, v] of Object.entries(props)) properties[k] = scrub(v);
  queue.push({ event, properties, timestamp: new Date().toISOString() });
  if (queue.length >= MAX_BATCH) send();
  else if (!timer) timer = setTimeout(() => send(), FLUSH_MS);
}

/** 한 세션에 한 번만 나가는 이벤트(input_first · first_frame 등) */
export function trackOnce(event: string, props: Props = {}): void {
  if (once.has(event)) return;
  once.add(event);
  track(event, props);
}

/** 부팅 뒤 경과 ms */
export function sinceBoot(): number {
  return Math.round(performance.now() - bootAt);
}

/** tx 실패 사유를 몇 갈래로 — 원문(주소 · 해시가 섞인다)은 보내지 않는다 */
export function txReason(err: unknown): string {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (/user rejected|denied|rejected the request/.test(m)) return "rejected";
  if (/insufficient|잔액/.test(m)) return "insufficient";
  if (/revert|execution reverted/.test(m)) return "reverted";
  if (/nonce|underpriced/.test(m)) return "nonce";
  if (/timeout|timed out|network|fetch/.test(m)) return "network";
  return "other";
}

/** main.tsx 에서 한 번 — 세션 · 생존 · 첫 입력 · 크래시 · 성능 등급 · 포셋 링크를 건다 */
export function installAnalytics(): void {
  if (!analyticsOn) return;
  installId = stored(INSTALL_KEY, randomId) ?? randomId();
  invite = inviteToken();
  track("app_open", { demo: import.meta.env.VITE_DEMO === "1" });
  track("session_start");

  let alive = 0;
  setInterval(() => {
    if (document.visibilityState === "visible") track("alive", { minutes: ++alive });
  }, 60_000);
  let ended = false;
  addEventListener("pagehide", () => {
    if (ended) return;
    ended = true;
    track("session_end", { seconds: Math.round(sinceBoot() / 1000) });
    send(true);
  });

  const firstInput = (kind: string) => () => trackOnce("input_first", { kind, ms: sinceBoot() });
  addEventListener("keydown", firstInput("key"), { once: true, capture: true });
  addEventListener("pointerdown", firstInput("pointer"), { once: true, capture: true });

  addEventListener("error", (e) => track("crash", { kind: "error", message: String(e.message ?? "") }));
  addEventListener("unhandledrejection", (e) =>
    track("crash", { kind: "rejection", message: String((e.reason as Error)?.message ?? e.reason ?? "") }),
  );

  // 포셋으로 나가는 링크는 여러 곳(HUD · 시연 자막)에 있다 — 한 곳에서 잡는다
  addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a?.href?.includes("faucet.giwa.io")) track("faucet_open");
    },
    true,
  );

  // 성능 등급 — 부팅 20초 뒤 5초 동안 rAF 를 센다(보이는 탭에서만)
  setTimeout(() => {
    if (document.visibilityState !== "visible") return;
    let frames = 0;
    const start = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - start < 5000) requestAnimationFrame(tick);
      else {
        const fps = (frames * 1000) / (performance.now() - start);
        track("perf_bucket", { fps: Math.round(fps), bucket: fps >= 50 ? "high" : fps >= 28 ? "ok" : "low" });
      }
    };
    requestAnimationFrame(tick);
  }, 20_000);
}
