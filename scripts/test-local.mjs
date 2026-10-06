// 로컬 체인 E2E — 컨트랙트 13종 전체를 배포하고 마을의 주요 흐름을 돌린다.
// 테스트넷 ETH를 한 방울도 쓰지 않으므로 몇 번을 돌려도 된다.
//
// anvil을 chain-id 91342(GIWA Sepolia와 동일)로 띄우므로 코드의 체인 가드가
// 그대로 통과하고, 같은 컨트랙트를 같은 설정으로 컴파일해 쓴다.
//
// 여기서만 할 수 있는 것: **시간 여행**.
//   - 장날(토 21시 KST) 온기 2배 — 테스트넷에선 토요일까지 기다려야 한다
//   - 도깨비 타격 쿨다운 30초
//   - 모닥불 10분 창이 닫힌 뒤에야 수령 가능
// 이 셋은 실시간을 기다리지 않고는 검증할 방법이 없던 것들이다.
//
// Usage: npm run test:local
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { formatEther, hashTypedData, parseEther, parseSignature } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  ANVIL_KEYS, ROOT, anvilMissingMessage, compileAll, deployAll, findAnvil,
  nextMarketDayStart, startChain,
} from "./lib/localchain.mjs";

if (!findAnvil()) {
  console.log(anvilMissingMessage());
  process.exit(0);
}

let fails = 0;
let group = "";
const section = (name) => {
  group = name;
  console.log(`\n${name}`);
};
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fails++;
};
/** revert가 나야 정상인 경우 */
async function shouldRevert(label, fn, expect = "") {
  try {
    await fn();
    check(label, false, "revert 되어야 하는데 통과했습니다");
  } catch (err) {
    const msg = err.shortMessage ?? err.message ?? "";
    const matched = !expect || msg.includes(expect);
    check(
      label,
      matched,
      matched ? (expect ? `"${expect}"` : "거부됨") : `예상 "${expect}", 실제 ${msg}`,
    );
  }
}

console.log("로컬 체인 E2E — 컨트랙트 13종 (anvil · chain-id 91342 · 가스 무제한)");

const chain = await startChain();
const send = async (wallet, req) => {
  const hash = await wallet.writeContract(req);
  const r = await chain.pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error("tx 실패");
  return r;
};
const read = (c, functionName, args = [], opts = {}) =>
  chain.pub.readContract({ address: c.address, abi: c.abi, functionName, args, ...opts });

try {
  // ── 배포 ────────────────────────────────────────────────────────────────
  section("배포");
  const artifacts = compileAll();
  check("컴파일", true, "13종 · 장터 v4 묶음만 optimizer");
  const C = await deployAll(chain, ANVIL_KEYS[0], artifacts);
  check("배포", Object.keys(C).length === 13, Object.keys(C).join(", "));

  // 참가자 — 상인, 손님, 이웃(모닥불 2인 요건용)
  const [merchantKey, buyerKey, neighborKey] = [ANVIL_KEYS[0], ANVIL_KEYS[1], ANVIL_KEYS[2]];
  const merchant = privateKeyToAccount(merchantKey);
  const buyer = privateKeyToAccount(buyerKey);
  const neighbor = privateKeyToAccount(neighborKey);
  for (const a of [merchant, buyer, neighbor]) await chain.fund(a.address, parseEther("100"));
  const wM = chain.wallet(merchantKey);
  const wB = chain.wallet(buyerKey);
  const wN = chain.wallet(neighborKey);

  // ── 노점 · 에스크로 · 쿠폰 (GiwaMarketV3) ───────────────────────────────
  section("노점 · 에스크로 · ERC-1155 쿠폰 (GiwaMarketV3)");
  const PRICE = parseEther("0.001");
  await send(wM, {
    address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi, functionName: "openStall",
    args: ["달래네 꼬치", 1350, -390, [{ name: "꼬치", emoji: "🍡", price: PRICE }]],
  });
  const stall = await read(C.GiwaMarketV3, "stallOf", [merchant.address]);
  check("노점 개설", stall.open && stall.items.length === 1, `${stall.title} · ${formatEther(PRICE)} ETH`);

  const [owners] = await read(C.GiwaMarketV3, "openStalls");
  check("openStalls() 목록에 잡힘", owners.length === 1);

  await shouldRevert(
    "정가와 다른 금액은 거부 (가격 강제)",
    () => send(wB, {
      address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi, functionName: "buyStall",
      args: [merchant.address, 0], value: PRICE / 2n,
    }),
  );

  const merchantBefore = await chain.pub.getBalance({ address: merchant.address });
  const buyRcpt = await send(wB, {
    address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi, functionName: "buyStall",
    args: [merchant.address, 0], value: PRICE,
  });
  const escrowBal = await chain.pub.getBalance({ address: C.GiwaMarketV3.address });
  check("대금이 에스크로에 잠김", escrowBal === PRICE, `${formatEther(escrowBal)} ETH 보관`);
  check(
    "판매자에게 아직 안 감",
    (await chain.pub.getBalance({ address: merchant.address })) === merchantBefore,
  );

  const purchaseId = await read(C.GiwaMarketV3, "purchaseCount").then((n) => n - 1n);
  const tokenId = await read(C.GiwaMarketV3, "tokenIdOf", [merchant.address, "꼬치"]);
  check(
    "구매자에게 ERC-1155 쿠폰 민팅",
    (await read(C.GiwaMarketV3, "balanceOf", [buyer.address, tokenId])) === 1n,
  );

  await shouldRevert(
    "제3자는 정산 확정 불가",
    () => send(wN, {
      address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi,
      functionName: "confirm", args: [purchaseId],
    }),
  );

  await send(wB, {
    address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi,
    functionName: "confirm", args: [purchaseId],
  });
  check(
    "확정 시 판매자 정산",
    (await chain.pub.getBalance({ address: merchant.address })) === merchantBefore + PRICE,
  );
  await shouldRevert(
    "이중 정산 거부",
    () => send(wB, {
      address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi,
      functionName: "confirm", args: [purchaseId],
    }),
  );

  await send(wB, {
    address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi,
    functionName: "redeem", args: [tokenId, 1n],
  });
  check(
    "쿠폰 사용 시 소각",
    (await read(C.GiwaMarketV3, "balanceOf", [buyer.address, tokenId])) === 0n,
  );

  // ── 흥정 (GiwaOffers) — 상인 봇을 실제로 실행한다 ────────────────────────
  section("흥정 — 상인 봇 실행 (GiwaOffers)");
  const npcs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "npcs.json"), "utf8")).npcs;
  const hyangdan = npcs.find((n) => n.id === "hyangdan");
  const botWalletsFile = path.join(ROOT, ".botwallets.json");
  if (fs.existsSync(botWalletsFile)) {
    const botKey = JSON.parse(fs.readFileSync(botWalletsFile, "utf8"))[hyangdan.walletIndex].privateKey;
    const botAcct = privateKeyToAccount(botKey);
    await chain.fund(botAcct.address, parseEther("10"));
    const wBot = chain.wallet(botKey);
    await send(wBot, {
      address: C.GiwaMarketV3.address, abi: C.GiwaMarketV3.abi, functionName: "openStall",
      args: [hyangdan.stall, 1350, -390, [{ name: "꼬치", emoji: "🍡", price: PRICE }]],
    });
    // 하한선 미만(40%) / 흥정 구간(90%) — 봇 쿨다운을 피하려 손님을 나눈다
    for (const [w, amt] of [[wB, "0.0004"], [wN, "0.0009"]]) {
      await send(w, {
        address: C.GiwaOffers.address, abi: C.GiwaOffers.abi, functionName: "makeOffer",
        args: [botAcct.address, "꼬치"], value: parseEther(amt),
      });
    }
    const out = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "merchant-bot.mjs"), "--npc", hyangdan.id, "--once"],
      {
        cwd: ROOT, encoding: "utf8",
        env: {
          ...process.env, GIWA_RPC_URL: chain.rpc,
          GIWA_MARKET_ADDRESS: C.GiwaMarketV3.address,
          GIWA_OFFERS_ADDRESS: C.GiwaOffers.address,
          ANTHROPIC_API_KEY: "",
        },
      },
    );
    const [, left] = await read(C.GiwaOffers, "offersFor", [botAcct.address]);
    const remaining = left.map((o) => formatEther(o.amount));
    check("하한선 미만(40%)은 거절되어 남음", remaining.includes("0.0004"));
    check("흥정 구간(90%)은 체결됨", !remaining.includes("0.0009"));
    check("모델을 부르지 않고 거절", out.includes("하한선 미만"));
  } else {
    console.log("  ⏭  .botwallets.json 없음 — 봇 시나리오 건너뜀");
  }

  // ── 길드 · 던전 (GiwaGuilds) ────────────────────────────────────────────
  section("길드 · 백층 던전 (GiwaGuilds)");
  check("던전 문 전략표 v2", Number(await read(C.GiwaGuilds, "RULESET_VERSION")) === 2);
  await send(wM, {
    address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi,
    functionName: "createGuild", args: ["기와길드", "🏯"],
  });
  check("길드 창설", (await read(C.GiwaGuilds, "guildOf", [merchant.address])) === 1n);
  await send(wB, {
    address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi, functionName: "joinGuild", args: [0n],
  });
  check("길드 가입", (await read(C.GiwaGuilds, "guildOf", [buyer.address])) === 1n);

  await chain.mine(2); // blockhash 시드용 블록 확보
  const expRcpt = await send(wM, {
    address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi, functionName: "enterExpedition", args: [],
  });
  const seed = await read(C.GiwaGuilds, "epochSeed", [await read(C.GiwaGuilds, "currentEpoch")]);
  check("주차 시드가 블록해시로 고정됨", seed !== `0x${"0".repeat(64)}`, `${seed.slice(0, 12)}…`);

  // 안전한 경로를 직접 계산해서 등반한다 (함정을 피하는 문을 고른다)
  const attempt = 1;
  const picks = [];
  for (let step = 0; step < 6; step++) {
    let chosen = null;
    for (let door = 0; door < 3; door++) {
      const roll = await read(C.GiwaGuilds, "doorRoll", [seed, 0n, attempt, BigInt(step), door]);
      if (roll !== 2) { chosen = door; break; }
    }
    if (chosen === null) break; // 세 문 다 함정 — 여기까지만 간다
    picks.push(chosen);
  }
  await send(wM, {
    address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi,
    functionName: "settleRun", args: [attempt, picks],
  });
  const guild = await read(C.GiwaGuilds, "guildAt", [0n]);
  check("귀환 정산 — 층수 기록", guild.d.best > 0, `${picks.length}문 통과 · best ${guild.d.best}층`);
  await shouldRevert(
    "같은 회차 이중 정산 거부",
    () => send(wM, {
      address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi,
      functionName: "settleRun", args: [attempt, picks],
    }),
  );
  await chain.mine(2);
  await send(wB, {
    address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi,
    functionName: "enterExpedition", args: [],
  });
  const epochSeconds = Number(await read(C.GiwaGuilds, "EPOCH_SECONDS"));
  const now = await chain.now();
  await chain.increaseTime(epochSeconds - (now % epochSeconds) + 1);
  await shouldRevert(
    "주차가 지난 원정은 새 주 기록에 정산할 수 없음",
    () => send(wB, {
      address: C.GiwaGuilds.address, abi: C.GiwaGuilds.abi,
      functionName: "settleRun", args: [2, [0]],
    }),
    "expired",
  );

  // ── 칭호 (GiwaHonors) ───────────────────────────────────────────────────
  section("소울바운드 칭호 (GiwaHonors)");
  check("개점 칭호 자격 있음", await read(C.GiwaHonors, "eligible", [merchant.address, 1n]));
  await send(wM, {
    address: C.GiwaHonors.address, abi: C.GiwaHonors.abi, functionName: "claim", args: [1n],
  });
  await send(wM, {
    address: C.GiwaHonors.address, abi: C.GiwaHonors.abi, functionName: "claim", args: [2n],
  });
  await send(wM, {
    address: C.GiwaHonors.address, abi: C.GiwaHonors.abi, functionName: "equip", args: [2n],
  });
  const [mask, equipped] = await read(C.GiwaHonors, "profileOf", [merchant.address]);
  check("개점·창설자 칭호 보유 + 장착", (mask & 0b110n) === 0b110n && equipped === 2n);
  await shouldRevert(
    "자격 없는 칭호 클레임 거부",
    () => send(wB, {
      address: C.GiwaHonors.address, abi: C.GiwaHonors.abi, functionName: "claim", args: [2n],
    }),
  );

  // ── 복주머니 (GiwaBoxes) — open→reveal 두 단계 ──────────────────────────
  // 결과는 openBox가 담긴 블록의 해시로 봉인된다 — 열기 전에는 아무도 결과를 모른다.
  section("복주머니 (GiwaBoxes)");
  await shouldRevert(
    "열지 않고 개봉 불가",
    () => send(wB, {
      address: C.GiwaBoxes.address, abi: C.GiwaBoxes.abi, functionName: "reveal", args: [],
    }),
    "wait",
  );
  const openRcpt = await send(wB, {
    address: C.GiwaBoxes.address, abi: C.GiwaBoxes.abi, functionName: "openBox", args: [],
  });
  check(
    "열기 — 결과가 이 블록 해시로 봉인됨",
    (await read(C.GiwaBoxes, "lastOpenAt", [buyer.address])) > 0n,
    `블록 ${openRcpt.blockNumber}`,
  );
  await shouldRevert(
    "개봉 대기 중 재열기 불가",
    () => send(wB, {
      address: C.GiwaBoxes.address, abi: C.GiwaBoxes.abi, functionName: "openBox", args: [],
    }),
    "pending",
  );
  await send(wB, {
    address: C.GiwaBoxes.address, abi: C.GiwaBoxes.abi, functionName: "reveal", args: [],
  });
  const [trinketMask] = await read(C.GiwaBoxes, "profileOf", [buyer.address]);
  check("장신구 획득", trinketMask > 0n, `mask ${trinketMask}`);
  await shouldRevert(
    "개봉 후 재개봉 불가 (대기 상태 소진)",
    () => send(wB, {
      address: C.GiwaBoxes.address, abi: C.GiwaBoxes.abi, functionName: "reveal", args: [],
    }),
    "wait",
  );

  // ── 문양 공방 (GiwaWorkshop) — 대금 창작자 직송 ─────────────────────────
  section("문양 공방 UGC (GiwaWorkshop)");
  const DESIGN_PRICE = parseEther("0.002");
  await send(wM, {
    address: C.GiwaWorkshop.address, abi: C.GiwaWorkshop.abi, functionName: "register",
    args: ["기와문양", `0x${"a5".repeat(16)}`, 3, DESIGN_PRICE],
  });
  check("문양 등록", (await read(C.GiwaWorkshop, "designCount")) === 1n);
  const creatorBefore = await chain.pub.getBalance({ address: merchant.address });
  await send(wB, {
    address: C.GiwaWorkshop.address, abi: C.GiwaWorkshop.abi,
    functionName: "buyDesign", args: [0n], value: DESIGN_PRICE,
  });
  check(
    "판매 대금이 창작자에게 직송",
    (await chain.pub.getBalance({ address: merchant.address })) === creatorBefore + DESIGN_PRICE,
    `+${formatEther(DESIGN_PRICE)} ETH`,
  );
  check("구매자 소유 기록", await read(C.GiwaWorkshop, "ownedOf", [buyer.address, 0n]));
  await send(wB, {
    address: C.GiwaWorkshop.address, abi: C.GiwaWorkshop.abi, functionName: "wear", args: [1n],
  });
  const worn = await read(C.GiwaWorkshop, "wornOf", [buyer.address]);
  check("착용 반영", worn[0] === true);

  // ── 프레즌스 (GiwaPresence) — 저장 없는 이벤트 비컨 ─────────────────────
  section("프레즌스 비컨 (GiwaPresence)");
  const beaconRcpt = await send(wB, {
    address: C.GiwaPresence.address, abi: C.GiwaPresence.abi,
    functionName: "beacon", args: [1234, -567, 10, -20, 1],
  });
  check("비컨 이벤트 발생", beaconRcpt.logs.length === 1);
  check(
    "저장 없음 (컨트랙트 스토리지 미사용)",
    (await chain.pub.getStorageAt({ address: C.GiwaPresence.address, slot: "0x0" })) ===
      `0x${"0".repeat(64)}`,
  );

  // ── 모닥불 온기 (GiwaHearth) — 시간 여행 ────────────────────────────────
  section("모닥불 온기 (GiwaHearth) — 10분 창 시간 여행");
  const WINDOW = Number(await read(C.GiwaHearth, "WINDOW"));
  await send(wM, { address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "gather", args: [] });
  const w0 = await read(C.GiwaHearth, "windowNow");
  await shouldRevert(
    "혼자서는 수령 불가 (창도 안 닫힘)",
    () => send(wM, {
      address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "claim", args: [w0],
    }),
  );
  await send(wN, { address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "gather", args: [] });
  check("두 사람이 같은 창에 모임", (await read(C.GiwaHearth, "countOf", [w0])) === 2);

  await chain.increaseTime(WINDOW + 1); // 창을 닫는다
  await send(wM, {
    address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "claim", args: [w0],
  });
  check(
    "창이 닫힌 뒤 온기 +1 (평일)",
    (await read(C.GiwaHearth, "warmthOf", [merchant.address])) === 1,
  );

  // ── 장날 (토 21시 KST) — 테스트넷에선 토요일을 기다려야만 확인 가능했다 ──
  section("장날 온기 2배 (토 21시 KST) — 실시간을 기다리지 않고 검증");
  const marketStart = nextMarketDayStart(await chain.now());
  await chain.setTime(marketStart + 60); // 장날 창 안으로 점프
  check(
    "컨트랙트가 장날로 인식",
    await read(C.GiwaHearth, "isMarketDay", [BigInt(marketStart + 60)]),
    new Date((marketStart + 60) * 1000).toISOString(),
  );
  const wMkt = await read(C.GiwaHearth, "windowNow");
  await send(wM, { address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "gather", args: [] });
  await send(wN, { address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "gather", args: [] });
  const warmthBefore = await read(C.GiwaHearth, "warmthOf", [merchant.address]);
  await chain.increaseTime(WINDOW + 1);
  await send(wM, {
    address: C.GiwaHearth.address, abi: C.GiwaHearth.abi, functionName: "claim", args: [wMkt],
  });
  const gained = (await read(C.GiwaHearth, "warmthOf", [merchant.address])) - warmthBefore;
  check("장날엔 온기 2배로 적립", gained === 2, `+${gained} (평일 +1)`);

  // 컨트랙트(Solidity)와 클라이언트(TS)의 장날 판정이 일치해야 한다.
  // 어긋나면 HUD는 "장날!"인데 실제로는 2배가 아닌 상태가 된다.
  const hearthTs = fs.readFileSync(
    path.join(ROOT, "client", "src", "chain", "hearth.ts"), "utf8",
  );
  const clientIsMarketDay = (ts) => {
    const day = Math.floor(ts / 86400);
    const sec = ts % 86400;
    return day % 7 === 2 && sec >= 12 * 3600 && sec < 13 * 3600;
  };
  check(
    "클라이언트 구현이 같은 규칙을 쓴다 (소스 확인)",
    /day % 7 === 2 && sec >= 12 \* 3600 && sec < 13 \* 3600/.test(hearthTs),
  );
  let mismatch = 0;
  const samples = [marketStart, marketStart + 3599, marketStart + 3600, marketStart - 1];
  for (let i = 0; i < 60; i++) samples.push(marketStart + (i - 30) * 3600 * 7);
  for (const ts of samples) {
    const onChain = await read(C.GiwaHearth, "isMarketDay", [BigInt(ts)]);
    if (onChain !== clientIsMarketDay(ts)) mismatch++;
  }
  check("컨트랙트 ↔ 클라이언트 장날 판정 일치", mismatch === 0, `표본 ${samples.length}개`);

  // ── 도깨비 토벌 (GiwaBoss) — 쿨다운 시간 여행 ───────────────────────────
  section("도깨비 토벌 (GiwaBoss) — 쿨다운 30초 시간 여행");
  const COOLDOWN = Number(await read(C.GiwaBoss, "COOLDOWN"));
  await send(wM, { address: C.GiwaBoss.address, abi: C.GiwaBoss.abi, functionName: "strike", args: [] });
  const s1 = await read(C.GiwaBoss, "statusOf", [merchant.address]);
  check("타격 — 체력 감소·기여 기록", s1[1] < 2000n && s1[3] > 0n, `남은 체력 ${s1[1]} · 내 기여 ${s1[3]}`);

  await shouldRevert(
    "쿨다운 중에는 재타격 거부",
    () => send(wM, { address: C.GiwaBoss.address, abi: C.GiwaBoss.abi, functionName: "strike", args: [] }),
    "cooldown",
  );
  await chain.increaseTime(COOLDOWN + 1);
  await send(wM, { address: C.GiwaBoss.address, abi: C.GiwaBoss.abi, functionName: "strike", args: [] });
  const s2 = await read(C.GiwaBoss, "statusOf", [merchant.address]);
  check(`쿨다운(${COOLDOWN}초) 경과 후 재타격 성공`, s2[3] > s1[3], `누적 기여 ${s2[3]}`);
  check("온기가 데미지에 반영됨 (온기 보유자)", s2[3] > 0n);

  // ── 프로필 애그리게이터 (GiwaProfile) — RPC 1콜 ─────────────────────────
  section("프로필 애그리게이터 (GiwaProfile)");
  const p = await read(C.GiwaProfile, "profileOf", [merchant.address]);
  check("길드 집계", p.guildIdPlus1 === 1n && p.guildName === "기와길드");
  check("칭호 집계", p.honorMask > 0n && p.honorEquipped === 2n);
  check("온기 집계", p.warmth >= 3, `온기 ${p.warmth}`);
  check("한 번의 호출로 전부", true, "guild·honor·trinket·wear·warmth·trophies");

  // ── 장터 v4 · 흥정 v2 (GiwaMarketV4 · GiwaOffersV2) — guide/V4.md ──────────
  section("장터 v4 · 흥정 v2 — 리스팅 없는 구매 막기 · 정산 때 쿠폰 · 흥정도 에스크로");
  const M4 = C.GiwaMarketV4;
  const O2 = C.GiwaOffersV2;
  const w4 = (wallet, c, functionName, args = [], value) =>
    send(wallet, { address: c.address, abi: c.abi, functionName, args, ...(value ? { value } : {}) });
  const bal = (a) => chain.pub.getBalance({ address: a });
  const coupons = (who, tid) => read(M4, "balanceOf", [who, tid]);
  check(
    "장터와 흥정이 서로를 가리킨다 (배포 때 고정 · 바꾸는 함수 없음)",
    (await read(M4, "offers")).toLowerCase() === O2.address.toLowerCase() &&
      (await read(O2, "market")).toLowerCase() === M4.address.toLowerCase(),
  );
  const P4 = parseEther("0.002");
  // 사용자 정의 에러는 shortMessage 에 이름이 없다 — viem 이 풀어 둔 errorName 으로 본다
  const revertsWith = async (label, fn, errorName) => {
    try {
      await fn();
      check(label, false, "revert 되어야 하는데 통과했습니다");
    } catch (err) {
      const got = err.walk?.((e) => e.data?.errorName)?.data?.errorName;
      check(label, got === errorName, got ? `${got}` : (err.shortMessage ?? err.message));
    }
  };
  await revertsWith("리스팅 없는 buy 는 거부 (1 wei 쿠폰 막힘)", () => w4(wB, M4, "buy", [merchant.address, "엿"], 1n), "NotListed");
  await w4(wM, M4, "list", ["엿", P4]);
  await revertsWith("리스팅 값과 다른 금액은 거부", () => w4(wB, M4, "buy", [merchant.address, "엿"], P4 - 1n), "WrongPrice");
  const yeotTid = await read(M4, "tokenIdOf", [merchant.address, "엿"]);
  await w4(wB, M4, "buy", [merchant.address, "엿"], P4);
  const pBuy = (await read(M4, "purchaseCount")) - 1n;
  check("정산 전에는 쿠폰이 아직 없다 (계약이 쥔다)", (await coupons(buyer.address, yeotTid)) === 0n);
  const mBefore4 = await bal(merchant.address);
  await w4(wB, M4, "confirm", [pBuy]);
  check("정산 확정 → 쿠폰이 구매자에게", (await coupons(buyer.address, yeotTid)) === 1n);
  check("정산 확정 → 대금이 판매자에게", (await bal(merchant.address)) - mBefore4 === P4);
  const uri4 = await read(M4, "uri", [yeotTid]);
  check(
    "uri 는 온체인 JSON (이름 · 판매자 · 테스트넷)",
    uri4.startsWith("data:application/json;utf8,") &&
      JSON.parse(uri4.slice("data:application/json;utf8,".length)).name === "엿" &&
      uri4.includes(merchant.address.toLowerCase()),
  );
  await w4(wM, M4, "list", ["따옴표\"엿", P4]);
  await w4(wB, M4, "buy", [merchant.address, "따옴표\"엿"], P4);
  const quoteTid = await read(M4, "tokenIdOf", [merchant.address, "따옴표\"엿"]);
  const quoteUri = await read(M4, "uri", [quoteTid]);
  check("이름에 따옴표가 있어도 JSON 이 깨지지 않는다", JSON.parse(quoteUri.slice(quoteUri.indexOf(",") + 1)).name === '따옴표"엿');

  // 환불은 쿠폰을 남기지 않는다
  await w4(wB, M4, "buy", [merchant.address, "엿"], P4);
  const pRefund = (await read(M4, "purchaseCount")) - 1n;
  await w4(wB, M4, "dispute", [pRefund]);
  const bBefore4 = await bal(buyer.address);
  await w4(wM, M4, "refund", [pRefund]);
  check("분쟁 → 판매자 환불: 대금이 구매자에게", (await bal(buyer.address)) - bBefore4 === P4);
  check("환불된 구매는 쿠폰을 남기지 않는다 (돈도 쿠폰도 가진 상태 없음)", (await coupons(buyer.address, yeotTid)) === 1n);
  await shouldRevert("환불 뒤 확정은 거부", () => w4(wB, M4, "confirm", [pRefund]), "settled");
  await shouldRevert(
    "흥정 계약이 아니면 purchaseFor 를 못 부른다",
    () => w4(wB, M4, "purchaseFor", [buyer.address, merchant.address, "엿"], 1n),
    "offers",
  );

  // 노점 · 페이지 · 한 번에 받기
  await w4(wM, M4, "openStall", ["달래네 엿", 1350, -390, [{ name: "가락엿", emoji: "🍬", price: P4 }]]);
  await w4(wN, M4, "openStall", ["이웃 좌판", 1400, -300, [{ name: "떡", emoji: "🍡", price: P4 }]]);
  let [, , total4] = await read(M4, "openStalls", [0n, 10n]);
  check("열린 노점 페이지 — 둘", total4 === 2n);
  await w4(wM, M4, "closeStall");
  const [owners4, , totalAfter] = await read(M4, "openStalls", [0n, 10n]);
  check("닫은 노점은 목록에서 빠진다 (swap-and-pop)", totalAfter === 1n && owners4[0] === neighbor.address);
  check("페이지 끝 너머는 빈 목록", (await read(M4, "openStalls", [5n, 10n]))[0].length === 0);
  await w4(wB, M4, "buyStall", [neighbor.address, 0], P4);
  await w4(wB, M4, "buyStall", [neighbor.address, 0], P4);
  const n4 = await read(M4, "purchaseCount");
  const due = [n4 - 2n, n4 - 1n];
  const early = await chain.pub.simulateContract({
    account: merchant.address, address: M4.address, abi: M4.abi, functionName: "releaseMany", args: [due],
  });
  check("기한 전 releaseMany 는 아무것도 정산하지 않는다", early.result === 0n);
  await chain.increaseTime(24 * 3600 + 1);
  const nBefore4 = await bal(neighbor.address);
  await w4(wM, M4, "releaseMany", [due]); // 누구나 부를 수 있다 — 대금은 판매자에게
  check("24시간 뒤 releaseMany — 두 건을 한 번에 판매자에게", (await bal(neighbor.address)) - nBefore4 === 2n * P4);
  check("정산된 노점 구매도 쿠폰이 구매자에게", (await coupons(buyer.address, await read(M4, "tokenIdOf", [neighbor.address, "떡"]))) === 2n);

  // 흥정 v2 — 리스팅 값 아래도 받고, 수락 뒤에도 에스크로를 탄다
  await w4(wB, O2, "makeOffer", [merchant.address, "엿"], P4 / 2n);
  const off0 = (await read(O2, "offerCount")) - 1n;
  await w4(wM, O2, "acceptOffer", [off0]);
  const pOffer = (await read(M4, "purchaseCount")) - 1n;
  const po = await read(M4, "purchaseOf", [pOffer]);
  check("리스팅된 품목도 더 낮은 흥정을 받을 수 있다", po[0] === buyer.address && po[2] === P4 / 2n);
  check("수락한 흥정은 즉시 정산하지 않는다 (에스크로 · 분쟁 경로)", po[4] === false);
  check("흥정 목록에서 빠진다", (await read(O2, "offersFor", [merchant.address, 0n, 10n]))[2] === 0n);
  await w4(wB, M4, "confirm", [pOffer]);
  check("흥정 구매도 확정 때 쿠폰", (await coupons(buyer.address, yeotTid)) === 2n);

  await w4(wB, O2, "makeOffer", [merchant.address, "가락엿"], P4 / 4n);
  const off1 = (await read(O2, "offerCount")) - 1n;
  await shouldRevert("남은 흥정을 판매자 아닌 사람이 수락 못 한다", () => w4(wN, O2, "acceptOffer", [off1]), "seller");
  await shouldRevert("만료 전에는 구매자만 무른다", () => w4(wN, O2, "cancelOffer", [off1]), "buyer");
  await chain.increaseTime(7 * 24 * 3600 + 1);
  await shouldRevert("만료된 흥정은 수락 못 한다", () => w4(wM, O2, "acceptOffer", [off1]), "expired");
  const bBeforeExp = await bal(buyer.address);
  await w4(wN, O2, "cancelOffer", [off1]);
  check("만료되면 누구나 무르고, 돈은 구매자에게", (await bal(buyer.address)) - bBeforeExp === P4 / 4n);

  for (const name of ["가", "나", "다"]) await w4(wB, O2, "makeOffer", [merchant.address, name], 1000n);
  const c3 = await read(O2, "offerCount");
  await w4(wB, O2, "cancelOffer", [c3 - 2n]);
  const [ids3, , total3] = await read(O2, "offersFor", [merchant.address, 0n, 10n]);
  check(
    "흥정 목록 페이지 — 무른 것은 빠지고 나머지는 남는다",
    total3 === 2n && ids3.includes(c3 - 3n) && ids3.includes(c3 - 1n) && !ids3.includes(c3 - 2n),
  );
  const escrowLeft = await bal(M4.address);
  const outstanding = await read(M4, "purchaseOf", [n4 - 3n]); // 위의 따옴표엿 — 아직 확정 전
  check("장터 잔고 = 정산 안 된 대금 (돈이 새지 않는다)", escrowLeft === outstanding[2], `${formatEther(escrowLeft)} ETH`);

  // ── 호패 (GiwaIdentity) — 진짜 지갑 ↔ 버너 ─────────────────────────────
  section("호패 (GiwaIdentity) — 진짜 지갑이 버너를 대리로 세운다");
  const principal = privateKeyToAccount(ANVIL_KEYS[3]); // UP.ID 를 가진 진짜 지갑 역할 — 가스 없이 서명만
  const linkTypes = {
    Link: [
      { name: "burner", type: "address" },
      { name: "principal", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const linkDomain = {
    name: "GiwaIdentity", version: "1", chainId: chain.chain.id, verifyingContract: C.GiwaIdentity.address,
  };
  const signLink = async (signer, burner, nonce, deadline) =>
    parseSignature(await signer.signTypedData({
      domain: linkDomain, types: linkTypes, primaryType: "Link",
      message: { burner, principal: principal.address, nonce, deadline },
    }));
  const linkArgs = (sig, deadline) => [principal.address, deadline, Number(sig.v ?? 27n + BigInt(sig.yParity)), sig.r, sig.s];
  const idDeadline = BigInt((await chain.now()) + 3600);
  const nonce0 = await read(C.GiwaIdentity, "nonces", [principal.address]);
  check(
    "컨트랙트의 다이제스트 = viem signTypedData 의 해시",
    (await read(C.GiwaIdentity, "linkDigest", [buyer.address, principal.address, nonce0, idDeadline])) ===
      hashTypedData({
        domain: linkDomain, types: linkTypes, primaryType: "Link",
        message: { burner: buyer.address, principal: principal.address, nonce: nonce0, deadline: idDeadline },
      }),
  );
  const sigOk = await signLink(principal, buyer.address, nonce0, idDeadline);
  await shouldRevert(
    "남의 버너가 그 서명을 가로채 걸 수 없다",
    () => send(wN, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigOk, idDeadline) }),
    "bad sig",
  );
  const sigForged = await signLink(neighbor, buyer.address, nonce0, idDeadline);
  await shouldRevert(
    "진짜 지갑이 아닌 사람의 서명은 거부",
    () => send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigForged, idDeadline) }),
    "bad sig",
  );
  await send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigOk, idDeadline) });
  check("버너에 호패가 걸림", (await read(C.GiwaIdentity, "principalOf", [buyer.address])) === principal.address);
  check("identityOf(버너) = 진짜 지갑", (await read(C.GiwaIdentity, "identityOf", [buyer.address])) === principal.address);
  check("호패 없는 주소는 자기 자신", (await read(C.GiwaIdentity, "identityOf", [neighbor.address])) === neighbor.address);
  await shouldRevert(
    "같은 서명은 두 번 쓰이지 않는다",
    () => send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigOk, idDeadline) }),
    "bad sig",
  );
  const pastDeadline = BigInt((await chain.now()) + 60);
  const sigLate = await signLink(principal, buyer.address, nonce0 + 1n, pastDeadline);
  await chain.increaseTime(120);
  await shouldRevert(
    "기한이 지난 서명은 거부",
    () => send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigLate, pastDeadline) }),
    "expired",
  );
  await shouldRevert(
    "남이 내 버너의 호패를 거둘 수 없다",
    () => send(wN, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "revoke", args: [buyer.address] }),
    "not yours",
  );
  await chain.fund(principal.address, parseEther("1"));
  const wP = chain.wallet(ANVIL_KEYS[3]);
  await send(wP, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "revoke", args: [buyer.address] });
  check("진짜 지갑이 잃은 버너의 호패를 거둠", (await read(C.GiwaIdentity, "principalOf", [buyer.address])) === "0x0000000000000000000000000000000000000000");
  const idDeadline2 = BigInt((await chain.now()) + 3600);
  const sigAgain = await signLink(principal, buyer.address, await read(C.GiwaIdentity, "nonces", [principal.address]), idDeadline2);
  await send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "link", args: linkArgs(sigAgain, idDeadline2) });
  await send(wB, { address: C.GiwaIdentity.address, abi: C.GiwaIdentity.abi, functionName: "unlink", args: [] });
  check("버너가 스스로 호패를 내려놓음", (await read(C.GiwaIdentity, "identityOf", [buyer.address])) === buyer.address);

  // ── v1 → v2 상태 보존 재배포 ───────────────────────────────────────────
  section("v2 마이그레이션 — 길드·칭호·전리품 상태 보존");
  const deployOne = async (name, args) => {
    const artifact = artifacts[name];
    const hash = await wM.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      account: merchant,
      args,
    });
    const receipt = await chain.pub.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success" || !receipt.contractAddress) {
      throw new Error(`${name} 마이그레이션 배포 실패`);
    }
    return { address: receipt.contractAddress, abi: artifact.abi };
  };
  const guildsV2 = await deployOne("GiwaGuilds", [C.GiwaGuilds.address]);
  const imported = await read(guildsV2, "allGuilds");
  check(
    "길드·회원·최고층 기록 이전",
    imported.length === 1 && imported[0].members.length === 2 && imported[0].d.best === guild.d.best,
    `길드 ${imported.length}개 · 회원 ${imported[0]?.members.length ?? 0}명 · best ${imported[0]?.d.best ?? 0}`,
  );
  const honorsV2 = await deployOne("GiwaHonors", [
    C.GiwaMarketV3.address,
    guildsV2.address,
    C.GiwaHonors.address,
  ]);
  const migratedHonor = await read(honorsV2, "profileOf", [merchant.address]);
  check(
    "기존 칭호 보유·장착 상태 폴백",
    migratedHonor[0] === mask && migratedHonor[1] === equipped,
    `mask ${migratedHonor[0]} · equipped ${migratedHonor[1]}`,
  );
  const bossV2 = await deployOne("GiwaBoss", [
    guildsV2.address,
    C.GiwaHearth.address,
    C.GiwaBoss.address,
  ]);
  check(
    "기존 전리품 카운터 폴백",
    (await read(bossV2, "trophiesOf", [merchant.address])) ===
      (await read(C.GiwaBoss, "trophiesOf", [merchant.address])),
  );
  const profileV2 = await deployOne("GiwaProfile", [
    guildsV2.address,
    honorsV2.address,
    C.GiwaBoxes.address,
    C.GiwaHearth.address,
    C.GiwaWorkshop.address,
    bossV2.address,
  ]);
  const migratedProfile = await read(profileV2, "profileOf", [merchant.address]);
  check(
    "새 프로필이 마이그레이션 묶음을 집계",
    migratedProfile.guildName === "기와길드" &&
      migratedProfile.honorMask === mask &&
      migratedProfile.warmth === p.warmth,
  );

  console.log(`\n${"─".repeat(58)}`);
  console.log(
    fails === 0
      ? "전부 통과 · 컨트랙트 13종 · 테스트넷 가스 0\n장날·쿨다운·10분 창은 시간을 점프해 검증했습니다 (실시간 대기 없음)"
      : `실패 ${fails}건`,
  );
} catch (err) {
  console.error(`\n[${group}] 예외:`, err.shortMessage ?? err.message);
  console.error(err.stack?.split("\n").slice(1, 4).join("\n"));
  fails++;
} finally {
  chain.stop();
}

process.exit(fails === 0 ? 0 : 1);
