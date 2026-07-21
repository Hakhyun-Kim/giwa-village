// MCP 서버 스모크 — 실제 stdio 클라이언트로 붙어 도구 목록과 읽기 도구를 확인한다.
// 쓰기 도구는 호출하지 않는다 (실거래·가스 소모). 키 없이도 통과해야 한다.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "..", "src", "index.mjs");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  // 스모크는 읽기만 — 키를 상속시키지 않아 실수로도 쓰기가 안 열리게 한다.
  env: { ...process.env, GIWA_PRIVATE_KEY: "" },
});

const client = new Client({ name: "giwa-mcp-smoke", version: "0.1.0" });

let failed = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

try {
  await client.connect(transport);
  console.log("기와장터 MCP 스모크\n");

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log(`도구 ${tools.length}종: ${names.join(", ")}\n`);

  const expected = [
    "look_around", "list_stalls", "get_profile", "guild_leaderboard",
    "list_offers", "who_is_here", "my_status",
    "open_stall", "close_stall", "buy_item", "make_offer",
    "accept_offer", "cancel_offer", "strike_boss",
  ];
  for (const name of expected) {
    check(`도구 등록: ${name}`, names.includes(name));
  }

  console.log("\n읽기 도구 (공개 RPC):");

  const stalls = await client.callTool({ name: "list_stalls", arguments: {} });
  const stallList = JSON.parse(stalls.content[0].text);
  check("list_stalls", Array.isArray(stallList), `노점 ${stallList.length}개`);

  const look = await client.callTool({ name: "look_around", arguments: {} });
  const world = JSON.parse(look.content[0].text);
  check(
    "look_around",
    typeof world.stallCount === "number" && typeof world.marketDay === "boolean",
    `노점 ${world.stallCount} · 접속 ${world.peopleMovingNow} · 장날 ${world.marketDay}`,
  );

  const board = await client.callTool({ name: "guild_leaderboard", arguments: {} });
  const guilds = JSON.parse(board.content[0].text);
  check("guild_leaderboard", Array.isArray(guilds), `길드 ${guilds.length}개`);

  if (stallList.length > 0) {
    const prof = await client.callTool({
      name: "get_profile",
      arguments: { address: stallList[0].owner },
    });
    const p = JSON.parse(prof.content[0].text);
    check("get_profile", typeof p.warmth === "number", `${stallList[0].owner.slice(0, 10)}… 온기 ${p.warmth}`);
  }

  console.log("\n키 없을 때 쓰기 차단:");
  const denied = await client.callTool({
    name: "open_stall",
    arguments: { title: "스모크", x: 0, z: 0, items: [{ name: "테스트", priceEth: "0.0001" }] },
  });
  check(
    "open_stall이 키 없이 거부됨",
    denied.isError === true && denied.content[0].text.includes("GIWA_PRIVATE_KEY"),
    denied.content[0].text.split("\n")[0].slice(0, 60),
  );

  console.log("\n잘못된 입력 거부:");
  const badAddr = await client.callTool({
    name: "get_profile",
    arguments: { address: "not-an-address" },
  });
  check("주소 형식 검증", badAddr.isError === true);
} catch (err) {
  failed++;
  console.error("\n스모크 실패:", err);
} finally {
  await client.close().catch(() => {});
}

console.log(failed === 0 ? "\n전부 통과" : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
