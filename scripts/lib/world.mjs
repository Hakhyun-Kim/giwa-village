// 마을을 기계가 읽는 형태로 굽는다 — client/public/world.json.
//
// 왜 있는가: 마을은 웹 클라이언트 하나가 아니라 프로토콜이다(PROTOCOL.md).
// 남이 만든 클라이언트도 같은 자리에 한옥을 세우고 같은 벽에 막혀야 하는데,
// 배치표는 TypeScript 안에 산다. 그래서 원본은 그대로 두고 **굽기만** 한다 —
// 표를 옮기지 않는다. 옮기면 두 벌이 되고, 두 벌은 반드시 어긋난다.
//
// 굽는 쪽과 검사하는 쪽이 이 파일 하나를 같이 쓴다(scripts/lib/haggle.mjs와 같은 꼴):
//   · npm run export-world  → 파일로 쓴다
//   · npm test              → 커밋된 파일과 대조한다 (안 구우면 빨간불)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const WORLD_FILE = path.join(ROOT, "client", "public", "world.json");

/** 이 문서의 판. 형식을 깨는 변경을 하면 올린다 (필드 추가는 올리지 않는다) */
export const WORLD_VERSION = 1;

const ts = (...seg) => pathToFileURL(path.join(ROOT, "client", "src", ...seg)).href;

/** 0.1mm까지 — 파일이 커지지 않으면서 눈으로 읽힌다 */
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const xyz = (p) => [r4(p[0]), r4(p[1]), r4(p[2])];

function collider(c) {
  return c.kind === "circle"
    ? { kind: "circle", x: r4(c.x), z: r4(c.z), r: r4(c.r) }
    : { kind: "box", x: r4(c.x), z: r4(c.z), hw: r4(c.hw), hd: r4(c.hd), rot: r4(c.rot) };
}

/**
 * 체인 정보는 config/giwa.ts에서 뽑는다. 그 파일은 import.meta.env를 만져서
 * 노드가 그대로 불러올 수 없으므로 소스를 읽는다 — 대신 못 찾으면 조용히
 * 기본값으로 넘어가지 않고 여기서 멈춘다. 틀린 체인 정보가 나가는 것보다 낫다.
 */
function chainIdentity() {
  const src = fs.readFileSync(path.join(ROOT, "client", "src", "config", "giwa.ts"), "utf8");
  const pick = (re, what) => {
    const m = src.match(re);
    if (!m) throw new Error(`config/giwa.ts에서 ${what}를 못 찾았습니다 — world.mjs를 함께 고치세요`);
    return m[1];
  };
  return {
    id: Number(pick(/\bid:\s*(\d+)/, "체인 ID")),
    name: pick(/\bname:\s*"([^"]+)"/, "체인 이름"),
    rpc: pick(/http:\s*\["([^"]+)"\]/, "RPC"),
    explorer: pick(/blockExplorers[\s\S]*?url:\s*"([^"]+)"/, "익스플로러"),
  };
}

export async function buildWorld() {
  const collide = await import(ts("game", "collide.ts"));
  const wander = await import(ts("demo", "wander.ts"));
  const track = await import(ts("audio", "track.ts"));
  const core = await import(ts("chain", "core.ts"));

  const cfg = {};
  for (const name of [
    "market", "honors", "guilds", "presence", "offers",
    "boxes", "hearth", "workshop", "boss", "profile",
  ]) {
    cfg[name] = await import(ts("config", `${name}.ts`));
  }
  const key = (name) => name.toUpperCase();
  const contracts = {};
  for (const [name, mod] of Object.entries(cfg)) {
    contracts[name] = {
      address: mod[`${key(name)}_ADDRESS`],
      // 이벤트를 훑을 때 여기서부터 보면 된다 (그 앞은 컨트랙트가 없다)
      fromBlock: Number(mod[`${key(name)}_DEPLOY_BLOCK`]),
    };
  }

  // 도깨비 체력에 따라 템포가 변하므로 표본으로 굳힌다 — 사이는 선형이다
  const huntSamples = [1, 0.75, 0.5, 0.25, 0].map((hp) => ({
    hp,
    ...track.trackShape("hunt", hp),
    stepSec: r4(track.trackShape("hunt", hp).stepSec),
  }));

  return {
    version: WORLD_VERSION,
    generated_by: "npm run export-world (scripts/lib/world.mjs) — 직접 고치지 마세요",
    spec: "PROTOCOL.md",

    chain: {
      ...chainIdentity(),
      /** 좌표를 정수로 실어 보낼 때의 배율 (x100) */
      posScale: core.POS_SCALE,
      contracts,
    },

    world: {
      radius: collide.WORLD_RADIUS,
      playerRadius: collide.PLAYER_R,
      npc: { radius: wander.NPC_R, speed: wander.NPC_SPEED },
      portal: xyz(collide.PORTAL_POS),
      campfire: xyz(collide.CAMPFIRE_POS),
      boss: xyz(collide.BOSS_POS),
    },

    layout: {
      hanoks: collide.HANOKS.map((h) => ({
        position: xyz(h.position),
        rotation: r4(h.rotation),
        tint: h.tint,
      })),
      trees: collide.TREES.map((t) => ({
        position: xyz(t.position),
        scale: r4(t.scale),
        pine: t.pine,
      })),
      lanterns: collide.LANTERNS.map(([x, z]) => [r4(x), r4(z)]),
      billboards: collide.BILLBOARDS.map((b) => ({
        position: xyz(b.position),
        rotation: r4(b.rotation),
        text: b.text,
        sub: b.sub,
      })),
    },

    /** 항상 그 자리에 있는 것들. 노점·도깨비는 생겼다 사라지므로 여기 없다 */
    colliders: collide.VILLAGE_COLLIDERS.map(collider),

    /** 노점이 생길 때 그 자리에 세울 것 — 크기 규칙만 준다 */
    stallCollider: {
      normal: collider(collide.stallCollider({ x: 0, z: 0 })),
      brand: collider(collide.stallCollider({ x: 0, z: 0, brand: true })),
    },

    audio: {
      /** 소리(심장박동)와 화면(붉은 맥동)이 같이 보는 임계 */
      lowHp: track.LOW_HP,
      tracks: { village: track.trackShape("village"), hunt: huntSamples },
    },
  };
}

/** 커밋된 파일과 대조할 때도 같은 글자를 보도록 직렬화를 한 곳에 둔다 */
export function serializeWorld(world) {
  return JSON.stringify(world, null, 2) + "\n";
}
