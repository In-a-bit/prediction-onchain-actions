"use server";

import { Interface, JsonRpcProvider } from "ethers";
import {
  feeModuleMatchOrdersV1,
  feeModuleMatchOrdersV2,
  orderFilledEvent,
  ordersMatchedEvent,
  feeChargedEvent,
  feeRefundedEvent,
} from "./abi";
import {
  calculatePrice,
  calculateFee,
  calculateTakingAmount,
  calculateRefund,
  priceToDecimal,
  formatBps,
  formatTokenAmount,
} from "./fee-math";

// ─── Types ───────────────────────────────────────────────────────────

export interface DecodedOrder {
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  sideName: string;
  signatureType: number;
  signature: string;
}

export interface OrderFeeAnalysis {
  price: number;
  priceRaw: string;
  effectiveFeeRate: string;
  exchangeFee: string;
  exchangeFeeFormatted: string;
}

export interface OrderFilledLog {
  orderHash: string;
  maker: string;
  taker: string;
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
  fee: string;
  feeFormatted: string;
}

export interface OrdersMatchedLog {
  takerOrderHash: string;
  takerOrderMaker: string;
  makerAssetId: string;
  takerAssetId: string;
  makerAmountFilled: string;
  takerAmountFilled: string;
}

export interface FeeChargedLog {
  receiver: string;
  tokenId: string;
  amount: string;
  amountFormatted: string;
}

export interface FeeRefundedLog {
  orderHash: string;
  to: string;
  id: string;
  refund: string;
  refundFormatted: string;
  feeCharged: string;
}

export interface TakerAnalysis {
  order: DecodedOrder;
  fillAmount: string;
  receiveAmount: string | null;
  feeAmount: string | null;
  feeAnalysis: OrderFeeAnalysis;
  refund: string;
  refundFormatted: string;
}

export interface MakerAnalysis {
  index: number;
  order: DecodedOrder;
  fillAmount: string;
  feeAmount: string | null;
  takingAmount: string;
  feeAnalysis: OrderFeeAnalysis;
  refund: string;
  refundFormatted: string;
}

export interface TxAnalysis {
  txHash: string;
  blockNumber: number;
  from: string;
  to: string;
  status: number;
  gasUsed: string;
  network: string;
  abiVersion: "v1" | "v2";
  taker: TakerAnalysis;
  makers: MakerAnalysis[];
  logs: {
    orderFilled: OrderFilledLog[];
    ordersMatched: OrdersMatchedLog[];
    feeCharged: FeeChargedLog[];
    feeRefunded: FeeRefundedLog[];
  };
  feeCurve: {
    explanation: string;
    formula: string;
  };
}

// ─── Constants ───────────────────────────────────────────────────────

const SIDE_NAMES = ["BUY", "SELL"] as const;
const DECIMALS = 6; // USDC decimals

function resolveRpcUrl(rpcKey: string): string {
  if (rpcKey === "mainnet") {
    const url = process.env.POLYGON_RPC_URL;
    if (!url) throw new Error("POLYGON_RPC_URL not configured in .env");
    return url;
  }
  if (rpcKey === "amoy") {
    const url = process.env.RPC_URL;
    if (!url) throw new Error("RPC_URL not configured in .env");
    return url;
  }
  throw new Error(`Unknown network key: ${rpcKey}`);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseOrder(raw: Record<string, unknown>): DecodedOrder {
  const side = Number(raw.side);
  return {
    salt: String(raw.salt),
    maker: String(raw.maker),
    signer: String(raw.signer),
    taker: String(raw.taker),
    tokenId: String(raw.tokenId),
    makerAmount: String(raw.makerAmount),
    takerAmount: String(raw.takerAmount),
    expiration: String(raw.expiration),
    nonce: String(raw.nonce),
    feeRateBps: String(raw.feeRateBps),
    side,
    sideName: SIDE_NAMES[side] ?? `UNKNOWN(${side})`,
    signatureType: Number(raw.signatureType),
    signature: String(raw.signature),
  };
}

function analyzeOrderFee(
  order: DecodedOrder,
  outcomeTokens: bigint,
  overrideMakerAmount?: bigint,
  overrideTakerAmount?: bigint
): OrderFeeAnalysis {
  const makerAmount = overrideMakerAmount ?? BigInt(order.makerAmount);
  const takerAmount = overrideTakerAmount ?? BigInt(order.takerAmount);
  const feeRateBps = BigInt(order.feeRateBps);

  const price = calculatePrice(makerAmount, takerAmount, order.side);
  const exchangeFee = calculateFee(feeRateBps, outcomeTokens, makerAmount, takerAmount, order.side);

  return {
    price: priceToDecimal(price),
    priceRaw: price.toString(),
    effectiveFeeRate: formatBps(feeRateBps),
    exchangeFee: exchangeFee.toString(),
    exchangeFeeFormatted: formatTokenAmount(exchangeFee, DECIMALS),
  };
}

// ─── Main analysis ───────────────────────────────────────────────────

export async function analyzeTx(
  txHash: string,
  rpcKey: string,
  network: string
): Promise<TxAnalysis> {
  const rpcUrl = resolveRpcUrl(rpcKey);
  const provider = new JsonRpcProvider(rpcUrl);

  // Fetch tx and receipt in parallel
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(txHash),
    provider.getTransactionReceipt(txHash),
  ]);

  if (!tx) throw new Error("Transaction not found");
  if (!receipt) throw new Error("Receipt not found");

  // Try decoding with both ABI versions
  let decoded: Record<string, unknown> | null = null;
  let abiVersion: "v1" | "v2" = "v1";

  // Try V2 first (more params)
  try {
    const ifaceV2 = new Interface([feeModuleMatchOrdersV2]);
    const result = ifaceV2.decodeFunctionData("matchOrders", tx.data);
    decoded = {
      takerOrder: result[0],
      makerOrders: result[1],
      takerFillAmount: result[2],
      takerReceiveAmount: result[3],
      makerFillAmounts: result[4],
      takerFeeAmount: result[5],
      makerFeeAmounts: result[6],
    };
    abiVersion = "v2";
  } catch {
    // Try V1
    try {
      const ifaceV1 = new Interface([feeModuleMatchOrdersV1]);
      const result = ifaceV1.decodeFunctionData("matchOrders", tx.data);
      decoded = {
        takerOrder: result[0],
        makerOrders: result[1],
        takerFillAmount: result[2],
        makerFillAmounts: result[3],
        makerFeeRate: result[4],
      };
      abiVersion = "v1";
    } catch {
      throw new Error(
        "Could not decode transaction data. This may not be a FeeModule.matchOrders transaction."
      );
    }
  }

  // Parse decoded data
  const takerOrder = parseOrder(decoded.takerOrder as Record<string, unknown>);
  const makerOrdersRaw = decoded.makerOrders as Record<string, unknown>[];
  const makerOrders = Array.from(makerOrdersRaw).map((o) => parseOrder(o));
  const takerFillAmount = BigInt(String(decoded.takerFillAmount));
  const makerFillAmounts = (decoded.makerFillAmounts as bigint[]).map((a) => BigInt(String(a)));

  // V2-specific params
  const takerReceiveAmount = decoded.takerReceiveAmount != null
    ? BigInt(String(decoded.takerReceiveAmount))
    : null;
  const takerFeeAmount = decoded.takerFeeAmount != null
    ? BigInt(String(decoded.takerFeeAmount))
    : null;
  const makerFeeAmounts = decoded.makerFeeAmounts != null
    ? (decoded.makerFeeAmounts as bigint[]).map((a) => BigInt(String(a)))
    : null;

  // ─── Taker analysis ─────────────────────────────
  // For taker fee calculation, the FeeModule uses ACTUAL match amounts
  // (fillAmount/receiveAmount), not the order's original amounts.
  const takerReceiveForCalc = takerReceiveAmount ?? calculateTakingAmount(
    takerFillAmount,
    BigInt(takerOrder.makerAmount),
    BigInt(takerOrder.takerAmount)
  );
  const takerOutcomeTokens = takerOrder.side === 0 // BUY
    ? takerReceiveForCalc
    : takerFillAmount;

  // Use actual match amounts for taker price & fee (not order amounts)
  // BUY: makerAmount=USDC paid (fillAmount), takerAmount=tokens received (receiveAmount)
  // SELL: makerAmount=tokens sold (fillAmount), takerAmount=USDC received (receiveAmount)
  const takerFeeAnalysis = analyzeOrderFee(
    takerOrder,
    takerOutcomeTokens,
    takerFillAmount,
    takerReceiveForCalc
  );

  // Calculate taker refund (already uses actual amounts — correct)
  const takerRefund = calculateRefund(
    BigInt(takerOrder.feeRateBps),
    takerFeeAmount ?? BigInt(0),
    takerOrder.side === 0 ? takerReceiveForCalc : takerFillAmount,
    takerFillAmount,
    takerReceiveForCalc,
    takerOrder.side
  );

  const taker: TakerAnalysis = {
    order: takerOrder,
    fillAmount: takerFillAmount.toString(),
    receiveAmount: takerReceiveAmount?.toString() ?? null,
    feeAmount: takerFeeAmount?.toString() ?? null,
    feeAnalysis: takerFeeAnalysis,
    refund: takerRefund.toString(),
    refundFormatted: formatTokenAmount(takerRefund, DECIMALS),
  };

  // ─── Maker analysis ─────────────────────────────
  const makers: MakerAnalysis[] = makerOrders.map((order, i) => {
    const fillAmount = makerFillAmounts[i];
    const takingAmount = calculateTakingAmount(
      fillAmount,
      BigInt(order.makerAmount),
      BigInt(order.takerAmount)
    );
    const outcomeTokens = order.side === 0 ? takingAmount : fillAmount;
    const feeAnalysis = analyzeOrderFee(order, outcomeTokens);

    const feeAmount = makerFeeAmounts ? makerFeeAmounts[i] : null;
    const makerRefund = calculateRefund(
      BigInt(order.feeRateBps),
      feeAmount ?? BigInt(0),
      order.side === 0 ? takingAmount : fillAmount,
      BigInt(order.makerAmount),
      BigInt(order.takerAmount),
      order.side
    );

    return {
      index: i,
      order,
      fillAmount: fillAmount.toString(),
      feeAmount: feeAmount?.toString() ?? null,
      takingAmount: takingAmount.toString(),
      feeAnalysis,
      refund: makerRefund.toString(),
      refundFormatted: formatTokenAmount(makerRefund, DECIMALS),
    };
  });

  // ─── Decode logs ────────────────────────────────
  const eventsIface = new Interface([
    orderFilledEvent,
    ordersMatchedEvent,
    feeChargedEvent,
    feeRefundedEvent,
  ]);

  const orderFilledLogs: OrderFilledLog[] = [];
  const ordersMatchedLogs: OrdersMatchedLog[] = [];
  const feeChargedLogs: FeeChargedLog[] = [];
  const feeRefundedLogs: FeeRefundedLog[] = [];

  for (const log of receipt.logs) {
    try {
      const parsed = eventsIface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed) continue;

      switch (parsed.name) {
        case "OrderFilled":
          orderFilledLogs.push({
            orderHash: parsed.args[0],
            maker: parsed.args[1],
            taker: parsed.args[2],
            makerAssetId: String(parsed.args[3]),
            takerAssetId: String(parsed.args[4]),
            makerAmountFilled: String(parsed.args[5]),
            takerAmountFilled: String(parsed.args[6]),
            fee: String(parsed.args[7]),
            feeFormatted: formatTokenAmount(BigInt(String(parsed.args[7])), DECIMALS),
          });
          break;
        case "OrdersMatched":
          ordersMatchedLogs.push({
            takerOrderHash: parsed.args[0],
            takerOrderMaker: parsed.args[1],
            makerAssetId: String(parsed.args[2]),
            takerAssetId: String(parsed.args[3]),
            makerAmountFilled: String(parsed.args[4]),
            takerAmountFilled: String(parsed.args[5]),
          });
          break;
        case "FeeCharged":
          feeChargedLogs.push({
            receiver: parsed.args[0],
            tokenId: String(parsed.args[1]),
            amount: String(parsed.args[2]),
            amountFormatted: formatTokenAmount(BigInt(String(parsed.args[2])), DECIMALS),
          });
          break;
        case "FeeRefunded":
          feeRefundedLogs.push({
            orderHash: parsed.args[0],
            to: parsed.args[1],
            id: String(parsed.args[2]),
            refund: String(parsed.args[3]),
            refundFormatted: formatTokenAmount(BigInt(String(parsed.args[3])), DECIMALS),
            feeCharged: String(parsed.args[4]),
          });
          break;
      }
    } catch {
      // Skip logs that don't match our events
    }
  }

  // ─── Fee curve explanation ──────────────────────
  const feeCurve = {
    explanation: [
      "The CTF Exchange uses a concave fee curve that charges less at extreme prices (near 0 or 1).",
      "The fee factor is: min(price, 1 - price), which peaks at 0.5 (50c) and drops to 0 at 0 or 1.",
      "This means trading on highly likely or unlikely outcomes costs less in fees.",
      "",
      "For BUY orders: fee is charged on the outcome tokens received.",
      "  fee = feeRateBps × min(price, 1-price) × outcomeTokens / (price × 10000)",
      "",
      "For SELL orders: fee is charged on the collateral (USDC) received.",
      "  fee = feeRateBps × min(price, 1-price) × outcomeTokens / (10000 × 1e18)",
      "",
      "The FeeModule can refund part of this fee if the operator-charged fee is less than the exchange-calculated fee.",
      "  refund = max(0, exchangeFee - operatorFee)",
    ].join("\n"),
    formula: "fee = feeRateBps × min(price, 1 - price) × outcomeTokens / divisor",
  };

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    from: tx.from,
    to: tx.to ?? "",
    status: receipt.status ?? 0,
    gasUsed: receipt.gasUsed.toString(),
    network,
    abiVersion,
    taker,
    makers,
    logs: {
      orderFilled: orderFilledLogs,
      ordersMatched: ordersMatchedLogs,
      feeCharged: feeChargedLogs,
      feeRefunded: feeRefundedLogs,
    },
    feeCurve,
  };
}
