// GIWA Sepolia 배포 정보의 스크립트용 단일 진입점.
// 원본은 deploy-village.mjs가 생성하는 client/src/config/*.ts 이다.
// Node에서 TS 모듈을 직접 불러오지 않고 상수만 읽어, 배포 오류 경로에서도
// 타입 스트리핑 런타임 핸들이 남지 않게 한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPECS = {
  GiwaMarketV3: ["market", "MARKET"],
  GiwaGuilds: ["guilds", "GUILDS"],
  GiwaPresence: ["presence", "PRESENCE"],
  GiwaHonors: ["honors", "HONORS"],
  GiwaOffers: ["offers", "OFFERS"],
  GiwaBoxes: ["boxes", "BOXES"],
  GiwaHearth: ["hearth", "HEARTH"],
  GiwaWorkshop: ["workshop", "WORKSHOP"],
  GiwaBoss: ["boss", "BOSS"],
  GiwaProfile: ["profile", "PROFILE"],
};

function readDeployment(file, prefix) {
  const source = fs.readFileSync(
    path.join(ROOT, "client", "src", "config", `${file}.ts`),
    "utf8",
  );
  const pick = (suffix, pattern) => {
    const match = source.match(new RegExp(`export const ${prefix}_${suffix} = ${pattern}`));
    if (!match) throw new Error(`config/${file}.ts에서 ${prefix}_${suffix}를 찾지 못했습니다`);
    return match[1];
  };
  return {
    address: pick("ADDRESS", '"(0x[0-9a-fA-F]{40})"'),
    tx: pick("DEPLOY_TX", '"(0x[0-9a-fA-F]{64})"'),
    block: BigInt(pick("DEPLOY_BLOCK", "([0-9]+)n")),
  };
}

export const DEPLOYMENTS = Object.fromEntries(
  Object.entries(SPECS).map(([name, [file, prefix]]) => [
    name,
    readDeployment(file, prefix),
  ]),
);

export const deployedAddresses = Object.fromEntries(
  Object.entries(DEPLOYMENTS).map(([name, deployment]) => [name, deployment.address]),
);
