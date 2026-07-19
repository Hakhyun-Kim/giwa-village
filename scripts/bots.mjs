// 봇 주민: 렌더링 없이 마을에 접속해 돌아다니고, 인사하고, 노점을 여는
// 헤드리스 클라이언트들. WebGL 창 10개 대신 이걸로 북적이는 마을을 만든다.
// Usage: node scripts/bots.mjs [--count 10]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "colyseus.js";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WS = process.env.WS_URL ?? "ws://localhost:2567";
const BOTS_FILE = path.resolve(ROOT, ".botwallets.json");

const countIdx = process.argv.indexOf("--count");
const COUNT = Math.min(
  20,
  Math.max(1, countIdx > 0 ? Number(process.argv[countIdx + 1]) || 10 : 10),
);

const NAMES = [
  "보부상 두칠", "주모 향단", "떡장수 순이", "방물장수 오씨", "엿장수 곰배",
  "나그네 바람", "길손 새벽", "포수 강쇠", "약초꾼 삼돌", "짚신장수 막개",
  "옹기장수 덕구", "국밥집 말녀", "붓장수 청암", "소금장수 갑돌", "어물전 복례",
  "갓장이 노첨지", "침모 금옥", "대장장이 무쇠", "풍각쟁이 놀부", "찻집 다래",
];

// 앞의 4명은 저잣거리에 노점을 편다
const BOT_STALLS = [
  { title: "싸다싸 목도리", x: 11, z: 4, items: [{ name: "목도리", emoji: "🧣", priceEth: "0.0008" }] },
  { title: "달래네 꼬치", x: 13.5, z: -4, items: [{ name: "꼬치", emoji: "🍡", priceEth: "0.0005" }, { name: "랜덤박스", emoji: "🎁", priceEth: "0.002" }] },
  { title: "곰배 엿가락", x: 24, z: 4.5, items: [{ name: "엿가락", emoji: "🍬", priceEth: "0.0004" }] },
  { title: "오씨 방물잡화", x: 30, z: 3.5, items: [{ name: "등불", emoji: "🏮", priceEth: "0.001" }, { name: "목검", emoji: "🗡️", priceEth: "0.003" }] },
];

const EMOTES = ["👋", "😄", "🙌", "🍚", "☀️"];

function loadBotWallets(n) {
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(BOTS_FILE, "utf8"));
  } catch {}
  while (list.length < n) {
    const pk = generatePrivateKey();
    list.push({ privateKey: pk, address: privateKeyToAccount(pk).address });
  }
  fs.writeFileSync(BOTS_FILE, JSON.stringify(list, null, 2) + "\n", "utf8");
  return list;
}

function colorFrom(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const a = 0.65 * Math.min(0.55, 1 - 0.55);
  const f = (nn) => {
    const k = (nn + hue / 30) % 12;
    return 0.55 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (
    (Math.round(f(0) * 255) << 16) |
    (Math.round(f(8) * 255) << 8) |
    Math.round(f(4) * 255)
  );
}

const rand = (min, max) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(index, wallet) {
    this.name = NAMES[index % NAMES.length];
    this.wallet = wallet;
    this.stall = BOT_STALLS[index] ?? null;
    this.x = rand(-6, 6);
    this.z = rand(-6, 6);
    this.rot = 0;
    this.room = null;
    this.stopped = false;
  }

  async start() {
    while (!this.stopped) {
      try {
        await this.session();
      } catch (err) {
        console.log(`[${this.name}] 연결 끊김, 3초 후 재접속 (${err.message})`);
      }
      if (!this.stopped) await sleep(3000);
    }
  }

  async session() {
    const client = new Client(WS);
    this.room = await client.joinOrCreate("village", {
      name: this.name,
      address: this.wallet.address,
      color: colorFrom(this.name),
    });
    this.room.onMessage("*", () => {});
    console.log(`[${this.name}] 입장`);

    const pingTimer = setInterval(() => this.room?.send("ping"), 5000);

    try {
      // 노점상은 자기 자리로 걸어가서 노점을 편다
      if (this.stall) {
        await this.walkTo(this.stall.x + rand(-0.5, 0.5), this.stall.z + rand(-0.5, 0.5));
        this.room.send("stall:open", {
          title: this.stall.title,
          items: this.stall.items,
        });
        console.log(`[${this.name}] 노점 개설: ${this.stall.title}`);
      }

      // 행동 루프
      while (!this.stopped) {
        const roll = Math.random();
        if (roll < 0.2) {
          this.room.send("emote", EMOTES[Math.floor(Math.random() * EMOTES.length)]);
          await sleep(rand(1500, 3000));
        } else if (this.stall) {
          // 노점상은 노점 주변만 서성인다
          await this.walkTo(
            this.stall.x + rand(-2, 2),
            this.stall.z + rand(-2, 2),
          );
          await sleep(rand(4000, 12000));
        } else {
          // 나머지는 광장~저잣거리를 돌아다닌다
          const spots = [
            [rand(-8, 8), rand(-8, 8)],
            [rand(10, 30), rand(-4, 4)],
            [rand(-4, 4), rand(-26, -12)],
          ];
          const [tx, tz] = spots[Math.floor(Math.random() * spots.length)];
          await this.walkTo(tx, tz);
          await sleep(rand(2000, 9000));
        }
      }
    } finally {
      clearInterval(pingTimer);
    }

    await new Promise((resolve, reject) => {
      this.room.onLeave(() => reject(new Error("room left")));
    });
  }

  async walkTo(tx, tz) {
    const speed = rand(2.2, 3.6);
    while (!this.stopped) {
      const dx = tx - this.x;
      const dz = tz - this.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.3) break;
      const step = Math.min(dist, speed * 0.1);
      this.x += (dx / dist) * step;
      this.z += (dz / dist) * step;
      this.rot = Math.atan2(dx, dz);
      this.room?.send("move", { x: this.x, z: this.z, rot: this.rot });
      await sleep(100);
    }
  }
}

const wallets = loadBotWallets(COUNT);
console.log(`봇 주민 ${COUNT}명 입장 시작 (Ctrl+C로 전원 퇴장)\n`);
const bots = [];
for (let i = 0; i < COUNT; i++) {
  const bot = new Bot(i, wallets[i]);
  bots.push(bot);
  void bot.start();
  await sleep(400); // 우르르 몰리지 않게 시차 입장
}

process.on("SIGINT", () => {
  console.log("\n봇 전원 퇴장 중…");
  for (const b of bots) {
    b.stopped = true;
    b.room?.leave();
  }
  setTimeout(() => process.exit(0), 1000);
});
