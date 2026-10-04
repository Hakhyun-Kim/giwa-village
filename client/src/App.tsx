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
import RaidInvite from "./ui/RaidInvite";
import { returnVillage } from "./net/expedition";
import { maybeStartShowcase } from "./demo/showcase";
import { TOUCH } from "./game/touch";

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
          store.setWalletError(
            err instanceof Error ? err.message : String(err),
          );
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

  return (
    <div className="app">
      {/* 화소 밀도 상한 — 휴대폰은 1.5 에서 자른다(2 의 절반 남짓의 픽셀). 렌더 전용이라 판정과 무관하다.
          (전에 있던 AdaptiveDpr 은 아무도 regress() 를 부르지 않아 해상도를 낮춘 적이 없었다) */}
      <Canvas
        shadows
        camera={{ position: [0, 9.5, 11.5], fov: 50 }}
        dpr={[1, TOUCH ? 1.5 : 2]}
        onCreated={() => requestAnimationFrame(() => trackOnce("first_frame", { ms: sinceBoot() }))}
      >
        {zone === "village" ? <><Village /><Portal /><Stalls /><RemotePlayers /><VillageExit /></> : <Outside />}
        <Player key={zone} />
      </Canvas>
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
      <WorkshopDialog />
      <QuestLog />
      <DailyRequest />
      <Welcome />
      </>}
      <WorldHud />
      <RaidInvite />
      <TouchControls />
    </div>
  );
}
