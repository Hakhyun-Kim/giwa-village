import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { trackOnce, sinceBoot } from "./net/analytics";
import Village from "./game/Village";
import Player from "./game/Player";
import RemotePlayers from "./game/RemotePlayers";
import Portal from "./game/Portal";
import Stalls from "./game/Stalls";
import Hud from "./ui/Hud";
import GiftDialog from "./ui/GiftDialog";
import GiftFeed from "./ui/GiftFeed";
import StallDialog from "./ui/StallDialog";
import StallOpenDialog from "./ui/StallOpenDialog";
import CouponBox from "./ui/CouponBox";
import GuildDialog from "./ui/GuildDialog";
import DungeonDialog from "./ui/DungeonDialog";
import HonorsDialog from "./ui/HonorsDialog";
import SellerLedgerDialog from "./ui/SellerLedgerDialog";
import GaekjuDialog from "./ui/GaekjuDialog";
import WorkshopDialog from "./ui/WorkshopDialog";
import QuestLog from "./ui/QuestLog";
import Welcome from "./ui/Welcome";
import TouchControls from "./ui/TouchControls";
import SocialDialog from "./ui/SocialDialog";
import DailyRequest from "./ui/DailyRequest";
import { joinVillage, leaveVillage } from "./net/colyseus";
import { useStore } from "./state/store";
import { colorFromString, loadBurner } from "./wallet/wallet";
import { DEMO } from "./config/giwa";
import { useWorld } from "./state/world";
import { Outside, VillageExit } from "./game/Outside";
import WorldHud from "./ui/WorldHud";
import { returnVillage } from "./net/expedition";
import { maybeStartShowcase } from "./demo/showcase";
import { TOUCH } from "./game/touch";
import { txErrorText } from "./net/txError";
import { hasWebGL } from "./game/webgl";

// 부팅 때 한 번만 묻는다 — 렌더마다 시험 문맥을 열지 않게
const WEBGL = hasWebGL();

export default function App() {
  const zone = useWorld(s => s.zone);
  useEffect(() => {
    const slot = new URLSearchParams(location.search)
      .get("slot")
      ?.toUpperCase();
    let cancelled = false;
    maybeStartShowcase();

    (async () => {
      const store = useStore.getState();
      if (slot && !DEMO) {
        try {
          // dev server may be mid-restart — retry before falling back to guest
          let address: `0x${string}` | null = null;
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              address = await loadBurner(slot);
              break;
            } catch (err) {
              if (attempt === 3) throw err;
              await new Promise((r) => setTimeout(r, 1000));
              if (cancelled) return;
            }
          }
          if (cancelled || !address) return;
          const name = `${slot}-${address.slice(2, 6)}`;
          const color = colorFromString(address.toLowerCase());
          store.setWallet(address, "burner", slot);
          store.setSelfIdentity(name, color);
          await joinVillage();
          return;
        } catch (err) {
          console.warn("[wallet] burner load failed, joining as guest:", err);
          store.setWalletError(txErrorText(err, 120));
        }
      }
      if (cancelled) return;
      const name = `주민${Math.floor(1000 + Math.random() * 9000)}`;
      const color = colorFromString(name + Math.random().toString(36));
      store.setSelfIdentity(name, color);
      await joinVillage();
    })();

    return () => {
      cancelled = true;
      leaveVillage();
      returnVillage();
    };
  }, []);

  // ESC 로 맨 위 창을 닫는다 — 창마다 바깥(.gift-overlay)을 누르면 닫히는 길이 이미 있으니
  // 그 바깥을 대신 눌러 준다. 창 열한 개에 같은 코드를 열한 번 쓰지 않으려는 것이다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat) return;
      const overlays = document.querySelectorAll<HTMLElement>(".gift-overlay");
      overlays[overlays.length - 1]?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      {/* 화소 밀도 상한 — 휴대폰은 1.5 에서 자른다(2 의 절반 남짓의 픽셀). 렌더 전용이라 판정과 무관하다.
          (전에 있던 AdaptiveDpr 은 아무도 regress() 를 부르지 않아 해상도를 낮춘 적이 없었다) */}
      {!WEBGL && (
        <div className="no-webgl" role="alert">
          <b>🏮 이 브라우저에서는 마을을 3D 로 그릴 수 없습니다</b>
          <p>브라우저 설정에서 <b>하드웨어 가속</b>을 켜거나, 최신 크롬 · 엣지 · 사파리로 다시 열어 주세요.
            지갑 · 노점 같은 기록은 체인에 그대로 있습니다.</p>
          <a href="./guide/play.html">노는 법 보기</a>
        </div>
      )}
      {WEBGL && <Canvas
        shadows
        camera={{ position: [0, 9.5, 11.5], fov: 50 }}
        dpr={[1, TOUCH ? 1.5 : 2]}
        onCreated={() => requestAnimationFrame(() => trackOnce("first_frame", { ms: sinceBoot() }))}
      >
        {zone === "village" ? <><Village /><Portal /><Stalls /><RemotePlayers /><VillageExit /></> : <Outside />}
        <Player key={zone} />
      </Canvas>}
      {zone === "village" && <>
      <Hud />
      <GiftFeed />
      <GiftDialog />
      <SocialDialog />
      <StallDialog />
      <StallOpenDialog />
      <CouponBox />
      <GuildDialog />
      <DungeonDialog />
      <HonorsDialog />
      <SellerLedgerDialog />
      <GaekjuDialog />
      <WorkshopDialog />
      {/* 3D 가 없으면 걸어서 하는 부탁 · 시연 권유는 할 수 없으니 안내만 남긴다 */}
      {WEBGL && <><QuestLog /><DailyRequest /><Welcome /></>}
      </>}
      <WorldHud />
      {WEBGL && <TouchControls />}
    </div>
  );
}
