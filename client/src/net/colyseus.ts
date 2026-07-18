import { Client, Room } from "colyseus.js";
import { WS_URL, DEMO } from "../config/giwa";
import {
  startDemo,
  demoGift,
  demoBuy,
  demoOpenStall,
  demoCloseStall,
} from "../demo/demo";
import { useStore, remoteTargets } from "../state/store";
import { addCoupon } from "../state/coupons";
import type { PlayerSnapshot, PlayerInfo, FeedEvent, Stall } from "../types";

interface SaleMessage extends FeedEvent {
  stallId: string;
  stallTitle: string;
  buyer: string;
  buyerName: string;
  buyerAddress: string;
  ownerName: string;
  priceEth: string;
}

let client: Client | null = null;
let room: Room | null = null;
let joinSeq = 0;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastIdentity: Identity | null = null;

function scheduleReconnect(seq: number) {
  setTimeout(() => {
    if (seq !== joinSeq || !lastIdentity) return;
    void joinVillage(lastIdentity);
  }, 2000);
}

function stopHeartbeat() {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}

export const localPos = { x: 0, z: 0, rot: 0, ready: false };

function getClient(): Client {
  if (!client) client = new Client(WS_URL);
  return client;
}

export interface Identity {
  name?: string;
  address?: string;
  color: number;
}

export async function joinVillage(identity: Identity): Promise<void> {
  if (DEMO) {
    startDemo(localPos);
    return;
  }
  const seq = ++joinSeq;
  lastIdentity = identity;
  const store = useStore.getState();

  stopHeartbeat();
  if (room) {
    room.removeAllListeners();
    void room.leave();
    room = null;
  }
  store.setStatus("connecting");
  store.setSelfId(null);
  localPos.ready = false;

  let joined: Room;
  try {
    joined = await getClient().joinOrCreate("village", identity);
  } catch (err) {
    console.error("[net] join failed:", err);
    if (seq === joinSeq) {
      store.setStatus("offline");
      scheduleReconnect(seq);
    }
    return;
  }

  if (seq !== joinSeq) {
    void joined.leave();
    return;
  }
  room = joined;
  store.setStatus("connected");
  store.setSelfId(room.sessionId);
  // app-level heartbeat so the server can reap zombie sockets
  heartbeat = setInterval(() => room?.send("ping"), 5000);

  room.onMessage("snapshot", (snapshot: PlayerSnapshot[]) => {
    const s = useStore.getState();
    const selfId = s.selfId;
    s.setOnlineCount(snapshot.length);

    let membershipChanged = false;
    const nextPlayers: Record<string, PlayerInfo> = {};

    for (const p of snapshot) {
      if (p.id === selfId) {
        if (!localPos.ready) {
          // adopt the server-assigned spawn point once
          localPos.x = p.x;
          localPos.z = p.z;
          localPos.ready = true;
        }
        continue;
      }
      nextPlayers[p.id] = { name: p.name, address: p.address, color: p.color };
      const target = remoteTargets.get(p.id);
      if (target) {
        target.x = p.x;
        target.z = p.z;
        target.rot = p.rot;
      } else {
        remoteTargets.set(p.id, { x: p.x, z: p.z, rot: p.rot });
        membershipChanged = true;
      }
      if (!(p.id in s.players)) membershipChanged = true;
    }

    for (const id of Object.keys(s.players)) {
      if (!(id in nextPlayers)) {
        remoteTargets.delete(id);
        membershipChanged = true;
      }
    }

    if (membershipChanged) s.setPlayers(nextPlayers);
  });

  room.onMessage("emote", (msg: { id: string; emote: string }) => {
    const s = useStore.getState();
    s.setEmote(msg.id, msg.emote);
    const at = useStore.getState().emotes[msg.id]?.at;
    if (at) setTimeout(() => useStore.getState().clearEmote(msg.id, at), 2200);
  });

  room.onMessage("leave", (id: string) => {
    remoteTargets.delete(id);
    useStore.getState().removePlayer(id);
  });

  room.onMessage(
    "gift",
    (g: FeedEvent & { from: string; to: string }) => {
      const s = useStore.getState();
      s.addFeed(g);
      // pop a 🎁 over the recipient's head briefly
      s.setEmote(g.to, "🎁");
      const at = useStore.getState().emotes[g.to]?.at;
      if (at) setTimeout(() => useStore.getState().clearEmote(g.to, at), 2600);
    },
  );

  room.onMessage("stalls", (list: Stall[]) => {
    useStore.getState().setStalls(list);
  });

  room.onMessage("stall:sale", (sale: SaleMessage) => {
    const s = useStore.getState();
    s.addFeed({
      kind: "sale",
      fromName: sale.buyerName,
      toName: sale.stallTitle,
      amountEth: sale.priceEth,
      itemName: sale.itemName,
      itemEmoji: sale.itemEmoji,
      tx: sale.tx,
      at: sale.at,
    });
    s.setEmote(sale.buyer, "🛍️");
    const at = useStore.getState().emotes[sale.buyer]?.at;
    if (at) setTimeout(() => useStore.getState().clearEmote(sale.buyer, at), 2600);
    // my purchase → drop the coupon into my local coupon box
    const my = s.walletAddress;
    if (my && sale.buyerAddress?.toLowerCase() === my.toLowerCase()) {
      addCoupon(my, {
        name: sale.itemName ?? "",
        emoji: sale.itemEmoji ?? "🎫",
        from: sale.stallTitle,
        priceEth: sale.priceEth,
        tx: sale.tx,
        at: sale.at,
      });
      s.bumpCoupons();
    }
  });

  // handlers are registered — now it is race-free to ask for the stall list
  room.send("stalls:get");

  room.onLeave(() => {
    stopHeartbeat();
    if (seq === joinSeq) {
      useStore.getState().setStatus("offline");
      scheduleReconnect(seq);
    }
  });
}

export function leaveVillage(): void {
  if (DEMO) return;
  ++joinSeq;
  stopHeartbeat();
  if (room) {
    room.removeAllListeners();
    void room.leave();
    room = null;
  }
}

export function sendMove(x: number, z: number, rot: number): void {
  room?.send("move", { x, z, rot });
}

export function sendEmote(icon: string): void {
  room?.send("emote", icon);
}

export function sendGift(to: string, amountEth: string, tx: string): void {
  if (DEMO) return demoGift(to, amountEth, tx);
  room?.send("gift", { to, amountEth, tx });
}

export function openStall(
  title: string,
  items: { name: string; emoji: string; priceEth: string }[],
): void {
  if (DEMO) return demoOpenStall(title, items);
  room?.send("stall:open", { title, items });
}

export function closeStall(): void {
  if (DEMO) return demoCloseStall();
  room?.send("stall:close");
}

export function buyStallItem(stallId: string, itemId: string, tx: string): void {
  if (DEMO) return demoBuy(stallId, itemId, tx);
  room?.send("stall:buy", { stallId, itemId, tx });
}
