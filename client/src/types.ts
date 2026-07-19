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
  /** 장착한 소울바운드 칭호 id — 아바타 코스메틱(부적) 렌더용 */
  honor?: number;
  /** 장착한 랜덤박스 장신구 id — 두 번째 모트 렌더용 */
  trinket?: number;
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

export interface GuildMember {
  address: string;
  name: string;
}

export interface Guild {
  id: string;
  name: string;
  emblem: string;
  founderAddress: string;
  createdAt: number;
  members: GuildMember[];
  dungeon: {
    epoch: number;
    floor: number;
    best: number;
    runs: number;
    attempts: number;
  };
}

/** 진행 중인 던전 원정 화면 상태 */
export interface DungeonView {
  guildId: string;
  guildName: string;
  emblem: string;
  epoch: number;
  seedBlock: number;
  seedHash: string;
  offchain: boolean;
  floor: number;
  tentative: number;
  attempt: number;
  lastOutcome?: "safe" | "bonus" | "trap";
  lastDoor?: number;
  ended?: boolean;
  banked?: number;
  busy?: boolean;
}

export interface Coupon {
  name: string;
  emoji: string;
  from: string;
  priceEth: string;
  tx: string;
  at: number;
  /** v2 에스크로 구매 id — 정산 확정에 사용 */
  purchaseId?: number;
  /** ERC-1155 쿠폰 토큰 id */
  tokenId?: string;
  /** 에스크로 정산 완료 여부 */
  settled?: boolean;
  /** 분쟁 신고됨 (자동 정산 7일 연장, 판매자 환불 가능) */
  disputed?: boolean;
  /** 쿠폰 사용(소각) 완료 — redeem tx 해시 */
  usedTx?: string;
  /** 다른 지갑에 선물함 — transfer tx 해시 */
  giftedTx?: string;
}
