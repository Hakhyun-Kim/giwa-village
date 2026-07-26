// 주민 산책 — 데모 NPC가 마을을 어떻게 돌아다니는가. 순수 모듈이다.
//
// 여기 있는 이유: 충돌을 넣은 뒤로 주민들이 이상하게 움직였다. 원인은 셋이었고
// 셋 다 "규칙"이라 브라우저 없이 검사할 수 있다 — 그래서 시뮬만 떼어냈다.
//
//  ① 상인의 집이 자기 좌판 안이었다. 매 틱 밖으로 밀려나며 제자리에서 떨었다.
//     → 밀려난 것도 그대로 화면에 넘긴다(아래 ③), 그리고 목표를 다시 고른다.
//  ② 목적지를 벽 안에서도 골랐다. 갈 수 없는 곳을 향해 평생 벽을 비볐다.
//     → 갈 수 있는 자리만 고른다.
//  ③ 막힌 틱에는 위치를 화면에 넘기지 않았다. 그동안 미끄러진 만큼이 다음 틱에
//     한꺼번에 반영돼 아바타가 튀었다. → 어떤 경우에도 매 틱 넘긴다.
//
// 방향도 "가려던 쪽"이 아니라 "실제로 간 쪽"을 본다. 벽을 따라 미끄러지는데
// 얼굴만 벽을 향하고 있으면 게걸음처럼 보인다.

// 확장자를 적는다 — 노드가 타입만 벗겨 이 파일을 그대로 불러 검사하기 때문
// (npm test가 브라우저 없이 주민들을 하루치 걸어 보게 하는 값이 확장자 세 글자보다 크다)
import { collide, insideAny } from "../game/collide.ts";

/** 주민 몸 반지름 — 플레이어(0.42)보다 조금 작게 잡아 좁은 골목을 지난다 */
export const NPC_R = 0.35;
/** 걷는 속도 (m/s). 플레이어(6)보다 느긋하다 */
export const NPC_SPEED = 2.4;
/** 집 주변 이만큼 안에서만 논다 */
const ROAM = 4;
/** 목표에 이만큼 붙으면 도착 */
const ARRIVE = 0.25;

export interface Wanderer {
  x: number;
  z: number;
  /** 실제로 움직인 쪽 (라디안) */
  rot: number;
  home: [number, number];
  /** 목적지 */
  tx: number;
  tz: number;
  /** 남은 대기 시간(초) */
  wait: number;
}

type Rand = () => number;

/** 갈 수 있는 자리만 고른다 — 벽 안을 목표로 삼으면 평생 벽을 비빈다 */
export function pickTarget(
  home: [number, number],
  rand: Rand = Math.random,
): { x: number; z: number } {
  for (let i = 0; i < 12; i++) {
    const x = home[0] + (rand() * 2 - 1) * ROAM;
    const z = home[1] + (rand() * 2 - 1) * ROAM;
    if (!insideAny(x, z, NPC_R)) return { x, z };
  }
  // 집이 통째로 막힌 자리라면 제자리에 선다 (그래도 몸은 밖으로 밀려난다)
  return { x: home[0], z: home[1] };
}

export function makeWanderer(home: [number, number], rand: Rand = Math.random): Wanderer {
  const n: Wanderer = {
    x: home[0],
    z: home[1],
    rot: 0,
    home,
    tx: home[0],
    tz: home[1],
    wait: rand() * 4,
  };
  // 상인은 좌판 뒤에 서 있다 — 첫 프레임부터 벽 밖에 세워 두면 밀려나는 것이 안 보인다
  collide(n, NPC_R);
  return n;
}

/** 한 틱. 제자리에서 좌표를 고친다(매 틱 도는 코드라 객체를 만들지 않는다) */
export function tickWander(n: Wanderer, dt: number, rand: Rand = Math.random): void {
  if (n.wait > 0) {
    n.wait -= dt;
    collide(n, NPC_R); // 노점이 새로 열려 몸에 겹쳤을 수 있다
    return;
  }

  const dx = n.tx - n.x;
  const dz = n.tz - n.z;
  const dist = Math.hypot(dx, dz);
  if (dist < ARRIVE) {
    n.wait = 2 + rand() * 8;
    ({ x: n.tx, z: n.tz } = pickTarget(n.home, rand));
    return;
  }

  const step = Math.min(dist, NPC_SPEED * dt);
  const fromX = n.x;
  const fromZ = n.z;
  n.x += (dx / dist) * step;
  n.z += (dz / dist) * step;
  collide(n, NPC_R);

  let movedX = n.x - fromX;
  let movedZ = n.z - fromZ;
  const moved = Math.hypot(movedX, movedZ);
  // 벽에 비스듬히 부딪히면 밀려난 만큼이 걸음에 더해져 한 틱에 튀어 나간다.
  // 걸음 길이로 되돌린다 — 다만 그 자리가 다시 벽 안이면 밀려난 자리를 쓴다.
  if (moved > step) {
    const back = step / moved;
    const px = fromX + movedX * back;
    const pz = fromZ + movedZ * back;
    if (!insideAny(px, pz, NPC_R)) {
      n.x = px;
      n.z = pz;
      movedX *= back;
      movedZ *= back;
    } else if (!insideAny(fromX, fromZ, NPC_R)) {
      // 모서리에 끼었다 — 튀어 나가느니 한 틱 서서 다른 데를 고른다.
      // (원래 자리가 이미 벽 안일 때만 밀려난 자리를 그대로 쓴다: 노점이 몸 위에
      //  새로 열린 경우인데, 여기서 되돌리면 영영 그 안에 갇힌다)
      n.x = fromX;
      n.z = fromZ;
      ({ x: n.tx, z: n.tz } = pickTarget(n.home, rand));
      return;
    }
  }
  if (Math.hypot(movedX, movedZ) < step * 0.3) {
    // 벽에 코를 박았다 — 비비고 서 있지 말고 갈 수 있는 다른 데를 고른다.
    // 여기서 멈춰 세우지 않는 것이 요점이다(멈췄다 섰다 하면 그게 더 이상하다).
    ({ x: n.tx, z: n.tz } = pickTarget(n.home, rand));
    return;
  }
  n.rot = Math.atan2(movedX, movedZ);
}
