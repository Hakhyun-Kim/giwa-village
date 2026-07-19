import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
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
import { joinVillage, leaveVillage } from "./net/colyseus";
import { useStore } from "./state/store";
import { colorFromString, loadBurner } from "./wallet/wallet";
import { DEMO } from "./config/giwa";
import { maybeStartShowcase } from "./demo/showcase";

export default function App() {
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
          await joinVillage({ name, address, color });
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
      await joinVillage({ name, color });
    })();

    return () => {
      cancelled = true;
      leaveVillage();
    };
  }, []);

  return (
    <div className="app">
      <Canvas shadows camera={{ position: [0, 9.5, 11.5], fov: 50 }}>
        <Village />
        <Portal />
        <Stalls />
        <Player />
        <RemotePlayers />
      </Canvas>
      <Hud />
      <GiftFeed />
      <GiftDialog />
      <StallDialog />
      <StallOpenDialog />
      <CouponBox />
      <GuildDialog />
      <DungeonDialog />
      <HonorsDialog />
      <SellerLedgerDialog />
      <WorkshopDialog />
      <QuestLog />
    </div>
  );
}
