// 도깨비 토벌 — 타격 데미지 (GiwaBoss.strike 의 순수 재현)
//
// 온체인(contracts/GiwaBoss.sol) 공식:
//   roll = uint256(keccak256(abi.encodePacked(blockhash(n-1), msg.sender, block.timestamp)))
//   dmg  = 10 + (roll % 21)            // 10~30
//   dmg += min(warmth, 20)             // 온기 보정
//   if (isMarketDay) dmg *= 2          // 장날(토 21시 KST) 2배
//
// ⚠ 던전과 달리 엔트로피에 block.timestamp 가 들어간다 — tx 가 채굴되기 전엔
// 값을 알 수 없다. 따라서 옵티미스틱 UI 는 "확정 데미지"가 아니라 strikeRange()
// 로 범위(막대 흔들림/롤 애니메이션)를 보여주고, Struck 이벤트로 실제값을 확정한다.
import { encodePacked, keccak256 } from "viem";

export const BOSS_BASE_HP = 2000n;
export const BOSS_COOLDOWN_SEC = 30;
export const WARMTH_CAP = 20;

/**
 * 실제 타격 데미지 — 온체인 GiwaBoss.strike 와 동일. 검증기가 Struck 이벤트의
 * dmg 를 (해당 블록해시·striker·타임스탬프로) 독립 재현·검증할 때 쓴다.
 * @param prevBlockHash blockhash(block.number - 1)
 * @param striker       msg.sender
 * @param timestampSec  block.timestamp (초)
 * @param warmth        모닥불 온기 (0~) — 내부에서 20 상한
 * @param marketDay     장날 여부 (hearth.isMarketDay)
 */
export function strikeDamage(
  prevBlockHash: `0x${string}`,
  striker: `0x${string}`,
  timestampSec: number | bigint,
  warmth: number,
  marketDay: boolean,
): bigint {
  const roll = BigInt(
    keccak256(
      encodePacked(
        ["bytes32", "address", "uint256"],
        [prevBlockHash, striker, BigInt(timestampSec)],
      ),
    ),
  );
  let dmg = 10n + (roll % 21n);
  dmg += BigInt(Math.min(Math.max(warmth, 0), WARMTH_CAP));
  if (marketDay) dmg *= 2n;
  return dmg;
}

export interface DamageRange {
  min: bigint;
  max: bigint;
}

/**
 * 타격 전에 보여줄 데미지 범위 — 옵티미스틱 UI 용.
 * base 10~30 + min(warmth,20), 장날이면 ×2.
 */
export function strikeRange(warmth: number, marketDay: boolean): DamageRange {
  const bonus = BigInt(Math.min(Math.max(warmth, 0), WARMTH_CAP));
  const mul = marketDay ? 2n : 1n;
  return { min: (10n + bonus) * mul, max: (30n + bonus) * mul };
}
