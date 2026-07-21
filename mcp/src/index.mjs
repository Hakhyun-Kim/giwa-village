#!/usr/bin/env node
// 기와장터 MCP 서버 — LLM이 사람과 같은 자격으로 마을에 참여한다.
//
// 읽기 도구는 공개 RPC만 쓰므로 키 없이 동작한다. 쓰기 도구는
// GIWA_PRIVATE_KEY가 있을 때만 열리고, 그 지갑이 곧 에이전트의 신원이다.
// 컨트랙트에는 이 트랜잭션이 사람 손에서 나왔는지 모델 루프에서 나왔는지
// 구분할 자리가 없다 — 에이전트 전용 특권 경로는 없다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as village from "./village.mjs";

const server = new McpServer({ name: "giwa-village", version: "0.1.0" });

/** MCP 응답은 텍스트 한 덩이 — 모델이 읽기 좋게 JSON으로 싣는다. */
function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, jsonSafe, 2) }] };
}
function fail(err) {
  return {
    isError: true,
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
  };
}
function jsonSafe(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

/** 도구 본문의 예외를 MCP 오류 응답으로 바꾼다 (서버가 죽지 않게). */
function tool(name, config, handler) {
  server.registerTool(name, config, async (args) => {
    try {
      return ok(await handler(args ?? {}));
    } catch (err) {
      return fail(err);
    }
  });
}

const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "0x로 시작하는 40자리 주소여야 합니다");

/** 쓰기 도구에서 주소 인자가 생략되면 내 지갑을 쓴다. */
function meOr(address) {
  if (address) return address;
  const acct = village.account;
  if (!acct) throw new Error("주소를 지정하거나 GIWA_PRIVATE_KEY를 설정하세요.");
  return acct.address;
}

// ── 읽기 (키 불필요) ───────────────────────────────────────────────────────

tool(
  "look_around",
  {
    title: "마을 둘러보기",
    description:
      "기와장터의 현재 상태를 한 번에 본다 — 열려 있는 노점, 지금 움직이는 주민, " +
      "주간 도깨비 체력, 장날 여부. 무엇을 할지 정하기 전에 먼저 부르면 좋다.",
    inputSchema: {},
  },
  async () => {
    const who = village.account?.address ?? "0x0000000000000000000000000000000000000000";
    const [stalls, presence, boss] = await Promise.all([
      village.getStalls(),
      village.getPresence().catch(() => []),
      village.getBoss(who).catch(() => null),
    ]);
    return {
      marketDay: village.isMarketDay(),
      marketDayNote: "매주 토 21시(KST)엔 온기·도깨비 데미지가 2배가 된다.",
      stallCount: stalls.length,
      stalls: stalls.map((s) => ({
        owner: s.owner,
        title: s.title,
        at: { x: s.x, z: s.z },
        items: s.items.map((i) => `${i.emoji} ${i.name} ${i.priceEth} ETH (index ${i.index})`),
      })),
      peopleMovingNow: presence.length,
      presence: presence.map((p) => ({ who: p.who, x: p.x, z: p.z })),
      boss: boss && {
        remaining: boss.remaining,
        maxHp: boss.maxHp,
        slain: boss.slain,
        myContribution: boss.myContrib,
      },
      me: village.account?.address ?? null,
    };
  },
);

tool(
  "list_stalls",
  {
    title: "노점 목록",
    description:
      "마을에 열려 있는 노점 전체를 품목·가격·좌표까지 본다. " +
      "buy_item에 넘길 seller 주소와 품목 index가 여기 있다.",
    inputSchema: {},
  },
  () => village.getStalls(),
);

tool(
  "get_profile",
  {
    title: "주민 프로필",
    description:
      "지갑 하나의 마을 소셜 프로필 — 길드·칭호·장신구·문양 착용·모닥불 온기·도깨비 전리품. " +
      "주소를 비우면 내 지갑을 본다.",
    inputSchema: { address: addressSchema.optional() },
  },
  ({ address }) => village.getProfile(meOr(address)),
);

tool(
  "guild_leaderboard",
  {
    title: "길드 순위",
    description: "이번 주 던전 등반 순위. 상위 3개 길드는 마을 광장에 깃발이 게양된다.",
    inputSchema: {},
  },
  () => village.getGuilds(),
);

tool(
  "list_offers",
  {
    title: "흥정 목록",
    description:
      "특정 판매자에게 걸려 있는 활성 흥정(에스크로된 제안)을 본다. " +
      "주소를 비우면 내 노점에 들어온 흥정을 본다.",
    inputSchema: { seller: addressSchema.optional() },
  },
  ({ seller }) => village.getOffersFor(meOr(seller)),
);

tool(
  "who_is_here",
  {
    title: "지금 마을에 누가 있나",
    description:
      "최근 프레즌스 비컨에서 지금 움직이는 아바타의 위치를 읽는다. " +
      "비컨은 저장 없는 이벤트라 '지금'만 보인다.",
    inputSchema: {
      lookbackBlocks: z.number().int().min(1).max(500).optional()
        .describe("몇 블록까지 거슬러 볼지 (기본 60 ≈ 1분, GIWA는 1초 블록)"),
    },
  },
  ({ lookbackBlocks }) => village.getPresence(lookbackBlocks ?? 60),
);

tool(
  "my_status",
  {
    title: "내 상태",
    description:
      "이 에이전트 지갑의 주소·잔액·노점·흥정·모닥불 온기·남은 지출 예산을 본다. " +
      "GIWA_PRIVATE_KEY가 필요하다.",
    inputSchema: {},
  },
  async () => {
    const { account } = village.requireWallet();
    const [balance, stalls, offers, hearth, boss] = await Promise.all([
      village.getBalanceEth(account.address),
      village.getStalls(),
      village.getOffersFor(account.address),
      village.getHearth(account.address).catch(() => null),
      village.getBoss(account.address).catch(() => null),
    ]);
    const mine = stalls.find((s) => s.owner.toLowerCase() === account.address.toLowerCase());
    return {
      address: account.address,
      balanceEth: balance,
      myStall: mine ?? null,
      incomingOffers: offers,
      hearth,
      boss: boss && { secondsUntilStrike: boss.secondsUntilStrike, myContribution: boss.myContrib },
      spending: {
        spentThisSessionEth: village.spentSoFarEth(),
        perTxLimitEth: village.MAX_SPEND_ETH,
        sessionBudgetEth: village.SESSION_BUDGET_ETH,
      },
    };
  },
);

// ── 쓰기 (GIWA_PRIVATE_KEY 필요) ───────────────────────────────────────────

tool(
  "open_stall",
  {
    title: "노점 열기",
    description:
      "마을 아무 자리에나 내 노점을 편다 — 개설과 가격 등록이 한 트랜잭션이다. " +
      "접속을 끊어도 노점은 마을에 남는다. 파는 것은 재화(쿠폰·코스메틱)만 " +
      "가능하다: 금융상품·투자계약은 마을 규칙 위반이다.",
    inputSchema: {
      title: z.string().min(1).max(40).describe("노점 간판 이름"),
      x: z.number().describe("마을 좌표 x (중앙 광장이 0, 반경 55 이내)"),
      z: z.number().describe("마을 좌표 z (중앙 광장이 0, 반경 55 이내)"),
      items: z
        .array(
          z.object({
            name: z.string().min(1).max(30),
            emoji: z.string().max(8).optional(),
            priceEth: z.string().describe('가격 (ETH 문자열, 예: "0.001")'),
          }),
        )
        .min(1)
        .max(8),
    },
  },
  ({ title, x, z, items }) => village.openStall(title, x, z, items),
);

tool(
  "close_stall",
  {
    title: "노점 닫기",
    description: "내 노점을 접는다. 정산되지 않은 에스크로는 그대로 남는다.",
    inputSchema: {},
  },
  () => village.closeStall(),
);

tool(
  "buy_item",
  {
    title: "물건 사기",
    description:
      "노점에서 정가로 산다. 대금은 에스크로에 잠기고 ERC-1155 쿠폰이 발행된다. " +
      "가격은 컨트랙트가 강제하므로 흥정 없이는 깎을 수 없다.",
    inputSchema: {
      seller: addressSchema.describe("노점 주인 주소 (list_stalls의 owner)"),
      index: z.number().int().min(0).max(7).describe("품목 index (list_stalls의 items[].index)"),
    },
  },
  ({ seller, index }) => village.buyStall(seller, index),
);

tool(
  "make_offer",
  {
    title: "흥정 걸기",
    description:
      "정가보다 낮은(또는 다른) 값을 불러 제안한다. 제안 금액은 에스크로에 잠기고, " +
      "판매자가 수락하면 즉시 체결된다. 수락 전에는 cancel_offer로 회수할 수 있다.",
    inputSchema: {
      seller: addressSchema.describe("노점 주인 주소"),
      itemName: z.string().min(1).describe("품목 이름 (노점에 있는 그대로)"),
      amountEth: z.string().describe('부를 값 (ETH 문자열, 예: "0.0007")'),
    },
  },
  ({ seller, itemName, amountEth }) => village.makeOffer(seller, itemName, amountEth),
);

tool(
  "accept_offer",
  {
    title: "흥정 수락",
    description:
      "내 노점에 들어온 흥정을 받는다. 제안가로 즉시 체결되고 쿠폰이 구매자에게 간다. " +
      "내가 판매자인 흥정만 수락할 수 있다.",
    inputSchema: { id: z.number().int().min(0).describe("흥정 id (list_offers)") },
  },
  ({ id }) => village.acceptOffer(id),
);

tool(
  "cancel_offer",
  {
    title: "흥정 취소",
    description: "내가 건 흥정을 물러 에스크로를 회수한다.",
    inputSchema: { id: z.number().int().min(0) },
  },
  ({ id }) => village.cancelOffer(id),
);

tool(
  "strike_boss",
  {
    title: "도깨비 때리기",
    description:
      "광장의 주간 도깨비를 한 대 친다. 쿨다운 30초는 사람과 똑같이 적용된다. " +
      "데미지는 블록해시 롤에 모닥불 온기 보정이 붙고, 장날엔 2배다.",
    inputSchema: {},
  },
  () => village.strikeBoss(),
);

// ── 기동 ───────────────────────────────────────────────────────────────────
// stdout은 MCP 프로토콜 전용이다. 사람이 볼 로그는 전부 stderr로.

const mode = village.account
  ? `쓰기 가능 (${village.account.address}, 1회 상한 ${village.MAX_SPEND_ETH} ETH · 세션 예산 ${village.SESSION_BUDGET_ETH} ETH)`
  : "읽기 전용 (GIWA_PRIVATE_KEY 없음)";
console.error(`[giwa-village-mcp] GIWA Sepolia · ${mode}`);

await server.connect(new StdioServerTransport());
