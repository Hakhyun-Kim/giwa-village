// @giwa-village/core 검증 — 체인 없이 순수 로직만. Node 24 가 .ts 타입을 스트립한다.
//   실행:  node core/test.mjs   (또는 core/ 안에서 npm test)
import assert from "node:assert/strict";
import {
  doorRoll,
  DOOR_PROFILES,
  resolveRun,
  safeDoorAt,
  strikeDamage,
  strikeRange,
} from "./src/index.ts";

const SEED = ("0x" + "ab".repeat(32)); // 고정 시드
let pass = 0;
const ok = (name) => {
  pass++;
  console.log(`  ✓ ${name}`);
};

// 1) 결정론 — 같은 입력이면 항상 같은 결과
{
  const a = doorRoll(SEED, 3n, 7, 2, 1);
  const b = doorRoll(SEED, 3n, 7, 2, 1);
  assert.equal(a, b);
  assert.ok(["safe", "bonus", "trap"].includes(a));
  ok(`doorRoll 결정론 (${a})`);
}

// 2) resolveRun 이 스텝별 doorRoll 과 일치하고, 함정에서 멈춘다
{
  const picks = [0, 1, 2, 0, 1, 0, 2, 1];
  const r = resolveRun(SEED, 3n, 7, picks);
  let climbed = 0;
  let trapAt = null;
  for (let i = 0; i < picks.length; i++) {
    const o = doorRoll(SEED, 3n, 7, i, picks[i]);
    assert.equal(o, r.steps[i]);
    if (o === "trap") {
      trapAt = i;
      break;
    }
    climbed += o === "safe" ? 1 : 2;
  }
  assert.equal(r.trapAt, trapAt);
  assert.equal(r.climbed, climbed);
  assert.equal(r.ok, trapAt === null);
  ok(`resolveRun = 스텝별 doorRoll 합산 (climbed=${r.climbed}, trapAt=${r.trapAt})`);
}

// 3) safeDoorAt 은 함정 아닌 문을 고른다 (있을 때)
{
  let checked = 0;
  for (let step = 0; step < 50; step++) {
    const d = safeDoorAt(SEED, 3n, 7, step);
    if (d !== null) {
      assert.notEqual(doorRoll(SEED, 3n, 7, step, d), "trap");
      checked++;
    }
  }
  assert.ok(checked > 0);
  ok(`safeDoorAt 은 항상 비-함정 문 (${checked}/50 스텝 확인)`);
}

// 4) 문별 분포 sanity — 돌(안정) / 바람(균형) / 도깨비(승부)
{
  const N = 12000;
  for (const profile of DOOR_PROFILES) {
    const c = { safe: 0, bonus: 0, trap: 0 };
    for (let i = 0; i < N; i++) {
      c[doorRoll(SEED, BigInt(i % 97), i % 41, i % 113, profile.id)]++;
    }
    const pct = (k) => (100 * c[k]) / N;
    const expectedSafe = (100 * profile.safeLt) / 256;
    const expectedBonus = (100 * (profile.bonusLt - profile.safeLt)) / 256;
    const expectedTrap = (100 * (256 - profile.bonusLt)) / 256;
    assert.ok(Math.abs(pct("safe") - expectedSafe) < 3, `${profile.name} safe ${pct("safe").toFixed(1)}%`);
    assert.ok(Math.abs(pct("bonus") - expectedBonus) < 3, `${profile.name} bonus ${pct("bonus").toFixed(1)}%`);
    assert.ok(Math.abs(pct("trap") - expectedTrap) < 3, `${profile.name} trap ${pct("trap").toFixed(1)}%`);
  }
  ok("문별 분포가 돌(안정)·바람(균형)·도깨비(승부) 표와 일치");
}

// 5) 보스 데미지 — 결정론 + 항상 strikeRange 안, 장날 2배
{
  const STRIKER = "0x1111111111111111111111111111111111111111";
  const BH = ("0x" + "cd".repeat(32));
  const range = strikeRange(0, false); // warmth 0, 평일 → 10~30
  assert.equal(range.min, 10n);
  assert.equal(range.max, 30n);

  for (let t = 1_700_000_000; t < 1_700_000_400; t++) {
    const d = strikeDamage(BH, STRIKER, t, 0, false);
    assert.ok(d >= range.min && d <= range.max, `dmg ${d} out of range`);
    assert.equal(strikeDamage(BH, STRIKER, t, 0, false), d); // 결정론
  }

  // 온기 12 + 장날 → (10+12)~(30+12) 의 2배 = 44~84
  const warm = strikeRange(12, true);
  assert.equal(warm.min, 44n);
  assert.equal(warm.max, 84n);
  const dm = strikeDamage(BH, STRIKER, 1_700_000_000, 12, true);
  assert.ok(dm >= warm.min && dm <= warm.max);
  ok(`strikeDamage 결정론 + 범위/장날 배수 일치 (평일 ${range.min}~${range.max}, 장날+온기 ${warm.min}~${warm.max})`);
}

console.log(`\n✔ core: ${pass}/5 통과 — 체인 없이 결정론 로직 검증 완료`);
