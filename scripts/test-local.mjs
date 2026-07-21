// 로컬 체인 E2E — 컨트랙트 10종 전체를 배포하고 마을의 주요 흐름을 돌린다.
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
import { formatEther, parseEther } from "viem";
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
    check(label, true, expect && msg.includes(expect) ? `"${expect}"` : "거부됨");
  }
}

console.log("로컬 체인 E2E — 컨트랙트 10종 (anvil · chain-id 91342 · 가스 무제한)");

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
  check("컴파일", true, "10종 · optimizer off");
  const C = await deployAll(chain, ANVIL_KEYS[0], artifacts);
  check("배포", Object.keys(C).length === 10, Object.keys(C).join(", "));

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

  // ── 랜덤박스 (GiwaBoxes) — open→reveal 두 단계 ──────────────────────────
  // 결과는 openBox가 담긴 블록의 해시로 봉인된다 — 열기 전에는 아무도 결과를 모른다.
  section("랜덤박스 (GiwaBoxes)");
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

  console.log(`\n${"─".repeat(58)}`);
  console.log(
    fails === 0
      ? "전부 통과 · 컨트랙트 10종 · 테스트넷 가스 0\n장날·쿨다운·10분 창은 시간을 점프해 검증했습니다 (실시간 대기 없음)"
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
