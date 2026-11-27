// 사람이 칸에 적은 ETH 금액을 체인에 보낼 wei 로 — 지갑 · 브라우저를 모르는 순수 모듈이라 npm test 가 그대로 불러 본다.
// 칸이 type="number" 라도 "1e-3" 같은 지수 표기가 들어오고, Number() 로는 통과한다. 그러면 viem 의 parseEther 가
// 영어로 던지거나(지수 표기), 소수점 아래 19자리부터는 말없이 0 wei 로 깎는다 — 노점 상품이 공짜로 올라간다.
// 그래서 금액을 받는 창(노점 열기 · 흥정 · 선물 · 문양 판매가)은 모두 이 한 곳을 지난다.
// 문양 판매가는 0(무료 배포)이 정상 값이라 allowZero 로 연다 — 대신 19자리 소수가 "무료"로 깎이는 것은 똑같이 막는다.

export type EthAmount = { wei: bigint; error?: undefined } | { wei?: undefined; error: string };

const WEI = 10n ** 18n;

export function parseEthInput(text: string, maxEth?: number, allowZero = false): EthAmount {
  const s = text.trim();
  if (!s) return { error: "금액을 적어 주세요." };
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { error: "금액은 0.01 처럼 숫자로만 적어 주세요." };
  const [whole, frac = ""] = s.split(".");
  if (frac.length > 18) return { error: "소수점 아래는 18자리까지만 됩니다." };
  const wei = BigInt(whole || "0") * WEI + BigInt((frac + "0".repeat(18)).slice(0, 18));
  if (wei === 0n && !allowZero) return { error: "금액은 0보다 커야 합니다." };
  if (maxEth !== undefined && wei > BigInt(Math.round(maxEth * 1e6)) * 10n ** 12n)
    return { error: `금액은 ${maxEth} ETH 까지입니다.` };
  return { wei };
}
