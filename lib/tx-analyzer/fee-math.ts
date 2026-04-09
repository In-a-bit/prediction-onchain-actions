// Replicates the CalculatorHelper.sol fee formulas using BigInt arithmetic.

const ZERO = BigInt(0);
const ONE = BigInt(10) ** BigInt(18);
const BPS_DIVISOR = BigInt(10_000);

export function calculatePrice(
  makerAmount: bigint,
  takerAmount: bigint,
  side: number // 0 = BUY, 1 = SELL
): bigint {
  if (side === 0) {
    // BUY: price = makerAmount * ONE / takerAmount
    return takerAmount !== ZERO ? (makerAmount * ONE) / takerAmount : ZERO;
  }
  // SELL: price = takerAmount * ONE / makerAmount
  return makerAmount !== ZERO ? (takerAmount * ONE) / makerAmount : ZERO;
}

function min(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function calculateFee(
  feeRateBps: bigint,
  outcomeTokens: bigint,
  makerAmount: bigint,
  takerAmount: bigint,
  side: number
): bigint {
  if (feeRateBps <= ZERO) return ZERO;

  const price = calculatePrice(makerAmount, takerAmount, side);
  if (price <= ZERO || price > ONE) return ZERO;

  if (side === 0) {
    // BUY: fee = (feeRateBps * min(price, ONE - price) * outcomeTokens) / (price * BPS_DIVISOR)
    return (feeRateBps * min(price, ONE - price) * outcomeTokens) / (price * BPS_DIVISOR);
  }
  // SELL: fee = feeRateBps * min(price, ONE - price) * outcomeTokens / (BPS_DIVISOR * ONE)
  return (feeRateBps * min(price, ONE - price) * outcomeTokens) / (BPS_DIVISOR * ONE);
}

export function calculateTakingAmount(
  makingAmount: bigint,
  makerAmount: bigint,
  takerAmount: bigint
): bigint {
  if (makerAmount === ZERO) return ZERO;
  return (makingAmount * takerAmount) / makerAmount;
}

export function calculateRefund(
  orderFeeRateBps: bigint,
  operatorFeeAmount: bigint,
  outcomeTokens: bigint,
  makerAmount: bigint,
  takerAmount: bigint,
  side: number
): bigint {
  const exchangeFee = calculateFee(orderFeeRateBps, outcomeTokens, makerAmount, takerAmount, side);
  if (exchangeFee <= operatorFeeAmount) return ZERO;
  return exchangeFee - operatorFeeAmount;
}

export function priceToDecimal(price: bigint): number {
  return Number(price) / Number(ONE);
}

export function formatBps(bps: bigint): string {
  const pct = Number(bps) / 100;
  return `${bps} bps (${pct}%)`;
}

export function formatTokenAmount(amount: bigint, decimals: number = 6): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === ZERO) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
