import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installDevHooks } from "./dev/hooks";
import { watchPanels } from "./audio/ui";
import { installFonts } from "./ui/fonts";
import { installAnalytics, track } from "./net/analytics";
import { useWorld } from "./state/world";

// 렌더보다 먼저 — rafshim은 r3f가 첫 프레임을 요청하기 전에 걸려 있어야 한다
installDevHooks();
// 창이 열리고 닫히는 소리는 여기 한 곳에서 건다 (새 다이얼로그도 공짜로 따라온다)
watchPanels();
installFonts();
// 계측 — VITE_ANALYTICS_KEY 없이 빌드하면 아무것도 하지 않는다(guide/ANALYTICS.md)
installAnalytics();
useWorld.subscribe((s, prev) => {
  if (s.zone !== prev.zone) track("zone_enter", { zone: s.zone });
});

createRoot(document.getElementById("root")!).render(<App />);
