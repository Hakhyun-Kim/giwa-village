export interface PlayerSnapshot {
  id: string;
  name: string;
  address: string;
  color: number;
  x: number;
  z: number;
  rot: number;
}

export interface PlayerInfo {
  name: string;
  address: string;
  color: number;
}

export interface EmoteEvent {
  icon: string;
  at: number;
}

export interface StallItem {
  id: string;
  name: string;
  emoji: string;
  priceEth: string;
}

export interface Stall {
  id: string;
  ownerAddress: string;
  ownerName: string;
  title: string;
  tag?: string;
  x: number;
  z: number;
  items: StallItem[];
  brand?: boolean;
  theme?: string;
  createdAt: number;
}

/** shared feed entry: wallet gift or stall sale */
export interface FeedEvent {
  kind: "gift" | "sale";
  fromName: string;
  toName: string;
  amountEth: string;
  itemName?: string;
  itemEmoji?: string;
  tx: string;
  at: number;
}

export interface Coupon {
  name: string;
  emoji: string;
  from: string;
  priceEth: string;
  tx: string;
  at: number;
}
