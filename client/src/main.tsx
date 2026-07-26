import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { installDevHooks } from "./dev/hooks";

// 렌더보다 먼저 — rafshim은 r3f가 첫 프레임을 요청하기 전에 걸려 있어야 한다
installDevHooks();

createRoot(document.getElementById("root")!).render(<App />);
