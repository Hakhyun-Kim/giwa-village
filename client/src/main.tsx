import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installDevHooks } from "./dev/hooks";
import { watchPanels } from "./audio/ui";
import { installFonts } from "./ui/fonts";

// 렌더보다 먼저 — rafshim은 r3f가 첫 프레임을 요청하기 전에 걸려 있어야 한다
installDevHooks();
// 창이 열리고 닫히는 소리는 여기 한 곳에서 건다 (새 다이얼로그도 공짜로 따라온다)
watchPanels();
installFonts();

createRoot(document.getElementById("root")!).render(<App />);
