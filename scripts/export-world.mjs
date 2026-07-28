// 마을 배치표를 client/public/world.json 으로 굽는다.
//
// Usage: npm run export-world
//
// 배치·충돌·소리 임계는 여전히 TypeScript 한 곳에 산다. 이건 그 표를 남이
// 읽을 수 있게 구운 것뿐이다. 굽는 것을 잊으면 npm test가 잡는다.

import fs from "node:fs";
import path from "node:path";
import { buildWorld, serializeWorld, WORLD_FILE } from "./lib/world.mjs";

const world = await buildWorld();
const text = serializeWorld(world);
const before = fs.existsSync(WORLD_FILE) ? fs.readFileSync(WORLD_FILE, "utf8") : null;

fs.mkdirSync(path.dirname(WORLD_FILE), { recursive: true });
fs.writeFileSync(WORLD_FILE, text, "utf8");

const kb = (text.length / 1024).toFixed(1);
console.log(
  `${before === text ? "그대로" : before === null ? "새로 씀" : "갱신"} — ${path.relative(process.cwd(), WORLD_FILE)} (${kb}KB)`,
);
console.log(
  `  한옥 ${world.layout.hanoks.length}채 · 나무 ${world.layout.trees.length}그루 · 콜라이더 ${world.colliders.length}개 · 컨트랙트 ${Object.keys(world.chain.contracts).length}종`,
);
