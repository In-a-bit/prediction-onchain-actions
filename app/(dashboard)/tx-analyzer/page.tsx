"use client";

import { useState, useMemo, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeTx, type TxAnalysis, type DecodedOrder } from "@/lib/tx-analyzer/actions";
import { calculateTakingAmount, formatTokenAmount } from "@/lib/tx-analyzer/fee-math";

const NETWORKS = [
  {
    name: "Polygon Mainnet",
    rpcKey: "mainnet",
    explorer: "https://polygonscan.com",
  },
  {
    name: "Polygon Amoy",
    rpcKey: "amoy",
    explorer: "https://amoy.polygonscan.com",
  },
] as const;

function shortenAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatExpiration(ts: string) {
  const n = Number(ts);
  if (n === 0) return "Never";
  const d = new Date(n * 1000);
  return d.toLocaleString();
}

function SideBadge({ side }: { side: number }) {
  return (
    <Badge
      variant="secondary"
      className={
        side === 0
          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      }
    >
      {side === 0 ? "BUY" : "SELL"}
    </Badge>
  );
}

const PARAM_ROWS: { param: string; buy: string; sell: string }[] = [
  { param: "makerAmount", buy: "USDC put in by order maker", sell: "Outcome tokens put in by order maker" },
  { param: "takerAmount", buy: "Outcome tokens order maker receives", sell: "USDC order maker receives" },
  { param: "fillAmount", buy: "USDC actually filled (partial of makerAmount)", sell: "Tokens actually filled (partial of makerAmount)" },
  { param: "receiveAmount", buy: "Tokens actually received", sell: "USDC actually received" },
  { param: "price", buy: "makerAmount / takerAmount (USDC per token)", sell: "takerAmount / makerAmount (USDC per token)" },
  { param: "feeRateBps", buy: "Max fee rate signed into order (basis points)", sell: "Same" },
  { param: "Exchange Fee", buy: "Fee calculated by exchange formula on tokens", sell: "Same formula" },
  { param: "Operator Fee", buy: "Fee the operator actually charged", sell: "Same" },
  { param: "Refund", buy: "max(0, exchangeFee - operatorFee)", sell: "Same" },
];

function ParameterReference() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h3 className="text-lg font-semibold">Parameter Reference</h3>
        <p className="mt-1 text-sm text-zinc-500">
          What each field means depending on the order side
        </p>
      </div>
      <div className="overflow-x-auto p-6">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-left dark:border-zinc-600">
              <th className="pb-2 pr-4 font-semibold">Parameter</th>
              <th className="pb-2 pr-4 font-semibold text-green-700 dark:text-green-400">BUY Order</th>
              <th className="pb-2 font-semibold text-red-700 dark:text-red-400">SELL Order</th>
            </tr>
          </thead>
          <tbody>
            {PARAM_ROWS.map((row) => (
              <tr
                key={row.param}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-2 pr-4 font-semibold text-zinc-700 dark:text-zinc-300">
                  {row.param}
                </td>
                <td className="py-2 pr-4 text-zinc-600 dark:text-zinc-400">
                  {row.buy}
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  {row.sell}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface LedgerRow {
  item: string;
  amount: string;
  unit: string;
  isSeparator?: boolean;
  isBold?: boolean;
  isGreen?: boolean;
}

function buildLedgerRows(
  label: string,
  side: number,
  fillAmount: string,
  receiveAmountRaw: string | null,
  feeAmount: string | null,
  exchangeFee: string,
  refund: string,
  makerAmount: string,
  takerAmount: string
): LedgerRow[] {
  const isBuy = side === 0;
  const fill = BigInt(fillAmount);
  const ref = BigInt(refund);

  const computedReceive = receiveAmountRaw
    ? BigInt(receiveAmountRaw)
    : calculateTakingAmount(fill, BigInt(makerAmount), BigInt(takerAmount));

  const rows: LedgerRow[] = [];

  if (isBuy) {
    rows.push({ item: "Paid (fillAmount)", amount: formatTokenAmount(fill, 6), unit: "USDC" });
    rows.push({ item: "Received (gross)", amount: formatTokenAmount(computedReceive, 6), unit: "Tokens" });
    rows.push({ item: "Exchange Fee (max)", amount: formatTokenAmount(BigInt(exchangeFee), 6), unit: "USDC" });
    rows.push({
      item: "Operator Fee",
      amount: feeAmount != null ? formatTokenAmount(BigInt(feeAmount), 6) : "N/A",
      unit: feeAmount != null ? "USDC" : "",
    });
    rows.push({ item: "Refund", amount: formatTokenAmount(ref, 6), unit: "USDC", isGreen: ref > BigInt(0) });
    rows.push({ item: "", amount: "", unit: "", isSeparator: true });
    const netCost = fill - ref;
    rows.push({ item: "Net Cost", amount: formatTokenAmount(netCost, 6), unit: "USDC", isBold: true });
    rows.push({ item: "Net Received", amount: formatTokenAmount(computedReceive, 6), unit: "Tokens", isBold: true });
  } else {
    rows.push({ item: "Paid (fillAmount)", amount: formatTokenAmount(fill, 6), unit: "Tokens" });
    rows.push({ item: "Received (gross)", amount: formatTokenAmount(computedReceive, 6), unit: "USDC" });
    rows.push({ item: "Exchange Fee (max)", amount: formatTokenAmount(BigInt(exchangeFee), 6), unit: "USDC" });
    rows.push({
      item: "Operator Fee",
      amount: feeAmount != null ? formatTokenAmount(BigInt(feeAmount), 6) : "N/A",
      unit: feeAmount != null ? "USDC" : "",
    });
    rows.push({ item: "Refund", amount: formatTokenAmount(ref, 6), unit: "USDC", isGreen: ref > BigInt(0) });
    rows.push({ item: "", amount: "", unit: "", isSeparator: true });
    rows.push({ item: "Net Cost", amount: formatTokenAmount(fill, 6), unit: "Tokens", isBold: true });
    const opFee = feeAmount != null ? BigInt(feeAmount) : BigInt(0);
    const netReceived = computedReceive - opFee + ref;
    rows.push({ item: "Net Received", amount: formatTokenAmount(netReceived, 6), unit: "USDC", isBold: true });
  }

  return rows;
}

function LedgerTable({ label, side, rows }: { label: string; side: number; rows: LedgerRow[] }) {
  return (
    <div className="rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-300 px-4 py-3 dark:border-zinc-700">
        <h4 className="font-mono font-semibold">{label}</h4>
        <SideBadge side={side} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b-2 border-zinc-300 text-left dark:border-zinc-600">
              <th className="px-4 py-2 font-semibold">Item</th>
              <th className="px-4 py-2 text-right font-semibold">Amount</th>
              <th className="px-4 py-2 font-semibold">Unit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) =>
              row.isSeparator ? (
                <tr key={i}>
                  <td colSpan={3} className="px-4">
                    <div className="border-t-2 border-double border-zinc-400 dark:border-zinc-500" />
                  </td>
                </tr>
              ) : (
                <tr
                  key={i}
                  className="border-b border-zinc-100 dark:border-zinc-800"
                >
                  <td
                    className={`px-4 py-1.5 ${row.isBold ? "font-bold" : ""} ${row.isGreen ? "text-green-600 dark:text-green-400" : ""}`}
                  >
                    {row.item}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-right tabular-nums ${row.isBold ? "font-bold" : ""} ${row.isGreen ? "text-green-600 dark:text-green-400" : ""}`}
                  >
                    {row.amount}
                  </td>
                  <td
                    className={`px-4 py-1.5 text-zinc-500 ${row.isBold ? "font-bold text-zinc-700 dark:text-zinc-300" : ""}`}
                  >
                    {row.unit}
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AccountantLedger({ analysis }: { analysis: TxAnalysis }) {
  const { taker, makers } = analysis;

  const takerRows = buildLedgerRows(
    "Taker",
    taker.order.side,
    taker.fillAmount,
    taker.receiveAmount,
    taker.feeAmount,
    taker.feeAnalysis.exchangeFee,
    taker.refund,
    taker.order.makerAmount,
    taker.order.takerAmount
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <h3 className="text-lg font-semibold">Settlement Ledger</h3>
        <p className="mt-1 text-sm text-zinc-500">
          Accountant-style summary of fills, fees, and net settlement per participant
        </p>
      </div>
      <div className="space-y-4 p-6">
        <LedgerTable label="Taker" side={taker.order.side} rows={takerRows} />
        {makers.map((m) => {
          const makerRows = buildLedgerRows(
            `Maker #${m.index}`,
            m.order.side,
            m.fillAmount,
            m.takingAmount,
            m.feeAmount,
            m.feeAnalysis.exchangeFee,
            m.refund,
            m.order.makerAmount,
            m.order.takerAmount
          );
          return (
            <LedgerTable
              key={m.index}
              label={`Maker #${m.index}`}
              side={m.order.side}
              rows={makerRows}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Fee curve helpers (floating-point, for visualization only) ───

function computeFeeDecimal(
  p: number, side: number, bps: number, tokens: number
): number {
  if (p <= 0 || p >= 1 || bps <= 0 || tokens <= 0) return 0;
  const ff = Math.min(p, 1 - p);
  return side === 0
    ? (bps * ff * tokens) / (p * 10000)
    : (bps * ff * tokens) / 10000;
}

function formatAxisLabel(v: number): string {
  if (v === 0) return "0";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(3);
  if (v >= 0.001) return v.toFixed(4);
  return v.toExponential(1);
}

// ─── Interactive Fee Curve Explorer ──────────────────────────────────

function FeeCurveExplorer({ analysis }: { analysis: TxAnalysis }) {
  const taker = analysis.taker;
  const isBuy = taker.order.side === 0;

  // Compute default tokens from analysis (raw → human-readable USDC-scale)
  const defaultTokensRaw = isBuy
    ? (taker.receiveAmount
        ? Number(taker.receiveAmount)
        : Number(calculateTakingAmount(
            BigInt(taker.fillAmount),
            BigInt(taker.order.makerAmount),
            BigInt(taker.order.takerAmount)
          )))
    : Number(taker.fillAmount);
  const defaultTokens = defaultTokensRaw / 1e6;
  const analysisPrice = taker.feeAnalysis.price;

  const [side, setSide] = useState(taker.order.side);
  const [feeRateBps, setFeeRateBps] = useState(Number(taker.order.feeRateBps));
  const [tokens, setTokens] = useState(defaultTokens);
  const [price, setPrice] = useState(Math.round(analysisPrice * 100) / 100);
  const [hoverInfo, setHoverInfo] = useState<{
    price: number; fee: number; svgX: number; svgY: number;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ─── Curve generation ─────
  const STEPS = 300;
  const curvePoints = useMemo(() =>
    Array.from({ length: STEPS }, (_, i) => {
      const p = 0.005 + (0.99 * i) / (STEPS - 1);
      return { p, fee: computeFeeDecimal(p, side, feeRateBps, tokens) };
    }),
    [side, feeRateBps, tokens]
  );

  const maxFee = useMemo(() => {
    const m = Math.max(...curvePoints.map(pt => pt.fee));
    return m > 0 ? m * 1.15 : 0.001;
  }, [curvePoints]);

  // ─── Chart geometry ─────
  const W = 720, H = 340;
  const PAD = { t: 25, r: 30, b: 50, l: 80 };
  const PW = W - PAD.l - PAD.r;
  const PH = H - PAD.t - PAD.b;

  const toX = (p: number) => PAD.l + ((p - 0.005) / 0.99) * PW;
  const toY = (f: number) => PAD.t + PH - (maxFee > 0 ? (f / maxFee) * PH : 0);
  const fromX = (x: number) => Math.max(0.01, Math.min(0.99, 0.005 + ((x - PAD.l) / PW) * 0.99));

  // ─── SVG paths ─────
  const pathD = useMemo(() =>
    curvePoints.map((pt, i) =>
      `${i === 0 ? "M" : "L"}${toX(pt.p).toFixed(1)},${toY(pt.fee).toFixed(1)}`
    ).join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [curvePoints, maxFee]
  );

  const fillD = useMemo(() => {
    const last = curvePoints[curvePoints.length - 1];
    const first = curvePoints[0];
    return `${pathD} L${toX(last.p).toFixed(1)},${toY(0).toFixed(1)} L${toX(first.p).toFixed(1)},${toY(0).toFixed(1)} Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathD, curvePoints, maxFee]);

  // ─── Y-axis ticks ─────
  const yTicks = useMemo(() => {
    if (maxFee <= 0) return [0];
    const rawStep = maxFee / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let step: number;
    if (norm <= 1.5) step = mag;
    else if (norm <= 3) step = 2 * mag;
    else if (norm <= 7) step = 5 * mag;
    else step = 10 * mag;
    const ticks: number[] = [];
    for (let v = 0; v <= maxFee; v += step) ticks.push(Math.round(v * 1e8) / 1e8);
    if (ticks.length < 2) ticks.push(maxFee);
    return ticks;
  }, [maxFee]);

  const xTicks = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

  // ─── Current price calcs ─────
  const currentFee = computeFeeDecimal(price, side, feeRateBps, tokens);
  const currentFeeRaw = Math.round(currentFee * 1e6);
  const minPP = Math.min(price, 1 - price);
  const feeFactor = side === 0 ? (price > 0 ? minPP / price : 0) : minPP;
  const feeAt50 = computeFeeDecimal(0.5, side, feeRateBps, tokens);
  const discountPct = feeAt50 > 0 ? (1 - currentFee / feeAt50) * 100 : 0;

  // Analysis reference marker (shown when user changes price from analyzed value)
  const analysisFee = computeFeeDecimal(
    analysisPrice, taker.order.side, Number(taker.order.feeRateBps), defaultTokens
  );
  const showAnalysisMarker =
    side === taker.order.side &&
    feeRateBps === Number(taker.order.feeRateBps) &&
    Math.abs(tokens - defaultTokens) < 0.001 &&
    Math.abs(price - analysisPrice) > 0.015;

  // ─── Mouse handlers ─────
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const p = fromX(svgX);
    if (p < 0.01 || p > 0.99) { setHoverInfo(null); return; }
    const fee = computeFeeDecimal(p, side, feeRateBps, tokens);
    setHoverInfo({ price: p, fee, svgX: toX(p), svgY: toY(fee) });
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const p = fromX(svgX);
    if (p >= 0.01 && p <= 0.99) setPrice(Math.round(p * 100) / 100);
  };

  const curveColor = side === 0 ? "#10b981" : "#ef4444";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">Fee Curve Explorer</h3>
          <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            Interactive
          </Badge>
          <Badge variant="outline">CalculatorHelper</Badge>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Explore the CTF Exchange concave fee curve — click the chart or drag sliders
        </p>
      </div>

      <div className="space-y-6 p-6">
        {/* Formula */}
        <div className="rounded-md border border-zinc-100 bg-zinc-50 p-4 font-mono text-sm leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-2">
            <span className="font-semibold text-green-600 dark:text-green-400">BUY</span>
            <span className="text-zinc-500"> fee = </span>
            <span className="text-zinc-800 dark:text-zinc-200">
              feeRateBps &times; min(p, 1&minus;p) &times; tokens / (p &times; 10,000)
            </span>
          </div>
          <div className="mb-2">
            <span className="font-semibold text-red-600 dark:text-red-400">SELL</span>
            <span className="text-zinc-500"> fee = </span>
            <span className="text-zinc-800 dark:text-zinc-200">
              feeRateBps &times; min(p, 1&minus;p) &times; tokens / 10,000
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            {side === 0
              ? "BUY: fee factor = min(p, 1\u2212p) / p \u2014 flat at 1.0 for p \u2264 0.50, then drops sharply toward 0."
              : "SELL: fee factor = min(p, 1\u2212p) \u2014 symmetric triangle peaking at 50\u00A2, drops to 0 at extremes."}
          </div>
        </div>

        {/* Controls */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">Side</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSide(0)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  side === 0
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setSide(1)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
                  side === 1
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                }`}
              >
                SELL
              </button>
              <button
                onClick={() => {
                  setSide(taker.order.side);
                  setFeeRateBps(Number(taker.order.feeRateBps));
                  setTokens(defaultTokens);
                  setPrice(Math.round(analysisPrice * 100) / 100);
                }}
                className="ml-auto rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Reset to analyzed
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Fee Rate:{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {feeRateBps} bps ({(feeRateBps / 100).toFixed(2)}%)
              </span>
            </label>
            <input
              type="range" min={0} max={2000} step={10}
              value={feeRateBps}
              onChange={(e) => setFeeRateBps(Number(e.target.value))}
              className="w-full accent-purple-600"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Outcome Tokens{" "}
              <span className="font-mono text-zinc-400">({(tokens * 1e6).toLocaleString()} raw)</span>
            </label>
            <Input
              type="number" step="0.1" min="0"
              value={tokens}
              onChange={(e) => setTokens(Number(e.target.value) || 0)}
              className="font-mono text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-500">
              Price:{" "}
              <span className="font-mono text-zinc-700 dark:text-zinc-300">
                {price.toFixed(2)} ({(price * 100).toFixed(0)}&cent;)
              </span>
            </label>
            <input
              type="range" min={1} max={99} step={1}
              value={Math.round(price * 100)}
              onChange={(e) => setPrice(Number(e.target.value) / 100)}
              className="w-full accent-purple-600"
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95].map((p) => (
                <button
                  key={p}
                  onClick={() => setPrice(p)}
                  className={`rounded px-2 py-0.5 font-mono text-xs transition-colors ${
                    Math.abs(price - p) < 0.005
                      ? "bg-purple-600 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {(p * 100).toFixed(0)}&cent;
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full cursor-crosshair select-none bg-zinc-50 dark:bg-zinc-900"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverInfo(null)}
            onClick={handleClick}
          >
            <defs>
              <linearGradient id="curveFillGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={curveColor} stopOpacity="0.25" />
                <stop offset="100%" stopColor={curveColor} stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {yTicks.map((v, i) => (
              <g key={`yt-${i}`}>
                <line
                  x1={PAD.l} y1={toY(v)} x2={W - PAD.r} y2={toY(v)}
                  stroke="currentColor" strokeDasharray="2,4"
                  className="text-zinc-200 dark:text-zinc-700"
                />
                <text
                  x={PAD.l - 8} y={toY(v) + 4} textAnchor="end"
                  className="fill-zinc-400 dark:fill-zinc-500"
                  fontSize="10" fontFamily="monospace"
                >
                  {formatAxisLabel(v)}
                </text>
              </g>
            ))}
            {xTicks.map((p) => (
              <g key={`xt-${p}`}>
                <line
                  x1={toX(p)} y1={PAD.t} x2={toX(p)} y2={H - PAD.b}
                  stroke="currentColor" strokeDasharray="2,4"
                  className="text-zinc-200 dark:text-zinc-700"
                />
                <text
                  x={toX(p)} y={H - PAD.b + 16} textAnchor="middle"
                  className="fill-zinc-400 dark:fill-zinc-500"
                  fontSize="11" fontFamily="monospace"
                >
                  {(p * 100).toFixed(0)}&cent;
                </text>
              </g>
            ))}

            {/* Axis labels */}
            <text x={W / 2} y={H - 6} textAnchor="middle" className="fill-zinc-500" fontSize="11">
              Price
            </text>
            <text
              x={16} y={H / 2} textAnchor="middle"
              transform={`rotate(-90, 16, ${H / 2})`}
              className="fill-zinc-500" fontSize="11"
            >
              Fee (USDC)
            </text>

            {/* 50c reference */}
            <text
              x={toX(0.5)} y={PAD.t - 6} textAnchor="middle"
              className="fill-zinc-400" fontSize="9"
            >
              50&cent; {side === 0 ? "edge" : "peak"}
            </text>

            {/* Fill + curve */}
            <path d={fillD} fill="url(#curveFillGrad)" />
            <path
              d={pathD} fill="none" stroke={curveColor}
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            />

            {/* Analysis reference marker */}
            {showAnalysisMarker && (
              <>
                <line
                  x1={toX(analysisPrice)} y1={PAD.t}
                  x2={toX(analysisPrice)} y2={H - PAD.b}
                  stroke="#a855f7" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
                />
                <polygon
                  points={`
                    ${toX(analysisPrice)},${toY(analysisFee) - 7}
                    ${toX(analysisPrice) + 5},${toY(analysisFee)}
                    ${toX(analysisPrice)},${toY(analysisFee) + 7}
                    ${toX(analysisPrice) - 5},${toY(analysisFee)}
                  `}
                  fill="#a855f7" opacity="0.7"
                />
                <text
                  x={toX(analysisPrice)} y={toY(analysisFee) - 12}
                  textAnchor="middle" fill="#a855f7" fontSize="9"
                >
                  analyzed
                </text>
              </>
            )}

            {/* Current price marker */}
            <line
              x1={toX(price)} y1={PAD.t} x2={toX(price)} y2={H - PAD.b}
              stroke={curveColor} strokeWidth="1.5" strokeDasharray="6,3" opacity="0.7"
            />
            <circle
              cx={toX(price)} cy={toY(currentFee)}
              r="6" fill={curveColor} stroke="white" strokeWidth="2"
            />

            {/* Hover crosshair + tooltip */}
            {hoverInfo && (
              <>
                <line
                  x1={hoverInfo.svgX} y1={PAD.t} x2={hoverInfo.svgX} y2={H - PAD.b}
                  stroke="currentColor" strokeWidth="0.5"
                  className="text-zinc-400 dark:text-zinc-500"
                />
                <line
                  x1={PAD.l} y1={hoverInfo.svgY} x2={W - PAD.r} y2={hoverInfo.svgY}
                  stroke="currentColor" strokeWidth="0.5"
                  className="text-zinc-300 dark:text-zinc-600"
                />
                <circle
                  cx={hoverInfo.svgX} cy={hoverInfo.svgY}
                  r="4" fill="white" stroke={curveColor} strokeWidth="1.5"
                />
                <g transform={`translate(${
                  hoverInfo.svgX > W - 160 ? hoverInfo.svgX - 140 : hoverInfo.svgX + 14
                }, ${
                  hoverInfo.svgY < 70 ? hoverInfo.svgY + 8 : hoverInfo.svgY - 58
                })`}>
                  <rect
                    width="128" height="48" rx="4"
                    className="fill-white stroke-zinc-300 dark:fill-zinc-800 dark:stroke-zinc-600"
                    opacity="0.95"
                  />
                  <text
                    x="8" y="18" fontSize="10" fontFamily="monospace"
                    className="fill-zinc-500 dark:fill-zinc-400"
                  >
                    Price: {(hoverInfo.price * 100).toFixed(1)}&cent;
                  </text>
                  <text
                    x="8" y="36" fontSize="11" fontFamily="monospace" fontWeight="600"
                    className="fill-zinc-800 dark:fill-zinc-200"
                  >
                    Fee: {formatAxisLabel(hoverInfo.fee)}
                  </text>
                </g>
              </>
            )}

            {/* Plot border */}
            <rect
              x={PAD.l} y={PAD.t} width={PW} height={PH}
              fill="none" stroke="currentColor"
              className="text-zinc-300 dark:text-zinc-600"
            />
          </svg>
        </div>

        {/* Readout cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">Fee Factor</div>
            <div className="mt-1 font-mono text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {feeFactor.toFixed(4)}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              min({price.toFixed(2)}, {(1 - price).toFixed(2)}) = {minPP.toFixed(2)}
              {side === 0 ? ` \u00F7 ${price.toFixed(2)}` : ""}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">Exchange Fee</div>
            <div className="mt-1 font-mono text-lg font-semibold" style={{ color: curveColor }}>
              {formatAxisLabel(currentFee)} USDC
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Raw: {currentFeeRaw.toLocaleString()}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">vs 50&cent; Price</div>
            <div className="mt-1 font-mono text-lg font-semibold text-zinc-800 dark:text-zinc-200">
              {discountPct > 0.5
                ? `${discountPct.toFixed(1)}% less`
                : discountPct < -0.5
                  ? `${Math.abs(discountPct).toFixed(1)}% more`
                  : "Same"}
            </div>
            <div className="mt-0.5 text-xs text-zinc-500">
              Fee at 50&cent;: {formatAxisLabel(feeAt50)}
            </div>
          </div>
        </div>

        {/* Insight text */}
        <div className="rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {side === 0 ? (
            <>
              <strong>BUY insight:</strong> The fee factor min(p, 1&minus;p) / p is{" "}
              <span className="font-mono font-semibold">constant at 1.0</span> for all prices &le; 50&cent;,
              then drops sharply toward 0 as price &rarr; 1.00. At {(price * 100).toFixed(0)}&cent;,
              you pay{" "}
              <span className="font-mono font-semibold">{discountPct.toFixed(0)}% less</span> than
              the max fee rate of {(feeRateBps / 100).toFixed(2)}%.
            </>
          ) : (
            <>
              <strong>SELL insight:</strong> The fee factor min(p, 1&minus;p) forms a{" "}
              <span className="font-mono font-semibold">symmetric triangle</span> peaking at 50&cent;.
              At {(price * 100).toFixed(0)}&cent;, the factor is{" "}
              <span className="font-mono font-semibold">{minPP.toFixed(2)}</span>, reducing the
              effective fee to{" "}
              <span className="font-mono font-semibold">
                {((feeRateBps / 100) * minPP).toFixed(2)}%
              </span>{" "}
              of position value.
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  label,
  order,
  fillAmount,
  receiveAmount,
  feeAmount,
  feeAnalysis,
  refund,
  refundFormatted,
  explorer,
}: {
  label: string;
  order: DecodedOrder;
  fillAmount: string;
  receiveAmount?: string | null;
  feeAmount?: string | null;
  feeAnalysis: { price: number; priceRaw: string; effectiveFeeRate: string; exchangeFee: string; exchangeFeeFormatted: string };
  refund: string;
  refundFormatted: string;
  explorer: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h4 className="font-semibold">{label}</h4>
        <SideBadge side={order.side} />
        <Badge variant="outline" className="font-mono text-xs">
          {["EOA", "POLY_PROXY", "GNOSIS_SAFE"][order.signatureType] ?? order.signatureType}
        </Badge>
      </div>
      <div className="space-y-3 p-4 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <div>
            <span className="text-zinc-500">Maker:</span>{" "}
            <a
              href={`${explorer}/address/${order.maker}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-blue-600 hover:underline dark:text-blue-400"
            >
              {shortenAddr(order.maker)}
            </a>
          </div>
          <div>
            <span className="text-zinc-500">Signer:</span>{" "}
            <span className="font-mono">{shortenAddr(order.signer)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Token ID:</span>{" "}
            <span className="font-mono text-xs">{order.tokenId}</span>
          </div>
          <div>
            <span className="text-zinc-500">Nonce:</span>{" "}
            <span className="font-mono">{order.nonce}</span>
          </div>
          <div>
            <span className="text-zinc-500">Maker Amount:</span>{" "}
            <span className="font-mono font-medium">{order.makerAmount}</span>
          </div>
          <div>
            <span className="text-zinc-500">Taker Amount:</span>{" "}
            <span className="font-mono font-medium">{order.takerAmount}</span>
          </div>
          <div>
            <span className="text-zinc-500">Expiration:</span>{" "}
            <span>{formatExpiration(order.expiration)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Taker (restriction):</span>{" "}
            <span className="font-mono">
              {order.taker === "0x0000000000000000000000000000000000000000" ? "Any" : shortenAddr(order.taker)}
            </span>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Fill & Fee Analysis
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div>
              <span className="text-zinc-500">Fill Amount:</span>{" "}
              <span className="font-mono font-medium">{fillAmount}</span>
            </div>
            {receiveAmount != null && (
              <div>
                <span className="text-zinc-500">Receive Amount:</span>{" "}
                <span className="font-mono font-medium">{receiveAmount}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Price:</span>{" "}
              <span className="font-mono font-medium">
                {feeAnalysis.price.toFixed(4)} ({(feeAnalysis.price * 100).toFixed(2)}c)
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Fee Rate:</span>{" "}
              <span className="font-mono">{feeAnalysis.effectiveFeeRate}</span>
            </div>
            <div>
              <span className="text-zinc-500">Exchange Fee (calculated):</span>{" "}
              <span className="font-mono">{feeAnalysis.exchangeFeeFormatted}</span>
            </div>
            {feeAmount != null && (
              <div>
                <span className="text-zinc-500">Operator Fee (param):</span>{" "}
                <span className="font-mono">{feeAmount}</span>
              </div>
            )}
            <div>
              <span className="text-zinc-500">Refund (calculated):</span>{" "}
              <span className={`font-mono ${refund !== "0" ? "font-medium text-green-600 dark:text-green-400" : ""}`}>
                {refundFormatted}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogsSection({ analysis }: { analysis: TxAnalysis }) {
  const { logs } = analysis;
  return (
    <div className="space-y-4">
      {logs.orderFilled.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">OrderFilled Events ({logs.orderFilled.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                  <th className="pb-1 pr-3">Order Hash</th>
                  <th className="pb-1 pr-3">Maker</th>
                  <th className="pb-1 pr-3">Taker</th>
                  <th className="pb-1 pr-3">Maker Filled</th>
                  <th className="pb-1 pr-3">Taker Filled</th>
                  <th className="pb-1 pr-3">Fee</th>
                </tr>
              </thead>
              <tbody>
                {logs.orderFilled.map((log, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3 font-mono">{log.orderHash.slice(0, 10)}...</td>
                    <td className="py-1.5 pr-3 font-mono">{shortenAddr(log.maker)}</td>
                    <td className="py-1.5 pr-3 font-mono">{shortenAddr(log.taker)}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.makerAmountFilled}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.takerAmountFilled}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.feeFormatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {logs.ordersMatched.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">OrdersMatched Events ({logs.ordersMatched.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                  <th className="pb-1 pr-3">Taker Hash</th>
                  <th className="pb-1 pr-3">Taker Maker</th>
                  <th className="pb-1 pr-3">Maker Asset</th>
                  <th className="pb-1 pr-3">Taker Asset</th>
                  <th className="pb-1 pr-3">Maker Filled</th>
                  <th className="pb-1 pr-3">Taker Filled</th>
                </tr>
              </thead>
              <tbody>
                {logs.ordersMatched.map((log, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3 font-mono">{log.takerOrderHash.slice(0, 10)}...</td>
                    <td className="py-1.5 pr-3 font-mono">{shortenAddr(log.takerOrderMaker)}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.makerAssetId}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.takerAssetId}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.makerAmountFilled}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.takerAmountFilled}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {logs.feeCharged.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">FeeCharged Events ({logs.feeCharged.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                  <th className="pb-1 pr-3">Receiver</th>
                  <th className="pb-1 pr-3">Token ID</th>
                  <th className="pb-1 pr-3">Amount</th>
                </tr>
              </thead>
              <tbody>
                {logs.feeCharged.map((log, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3 font-mono">{shortenAddr(log.receiver)}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.tokenId}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.amountFormatted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {logs.feeRefunded.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold">FeeRefunded Events ({logs.feeRefunded.length})</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-700">
                  <th className="pb-1 pr-3">Order Hash</th>
                  <th className="pb-1 pr-3">To</th>
                  <th className="pb-1 pr-3">Token ID</th>
                  <th className="pb-1 pr-3">Refund</th>
                  <th className="pb-1 pr-3">Fee Charged</th>
                </tr>
              </thead>
              <tbody>
                {logs.feeRefunded.map((log, i) => (
                  <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="py-1.5 pr-3 font-mono">{log.orderHash.slice(0, 10)}...</td>
                    <td className="py-1.5 pr-3 font-mono">{shortenAddr(log.to)}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.id}</td>
                    <td className="py-1.5 pr-3 font-mono text-green-600 dark:text-green-400">{log.refundFormatted}</td>
                    <td className="py-1.5 pr-3 font-mono">{log.feeCharged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {logs.orderFilled.length === 0 &&
        logs.ordersMatched.length === 0 &&
        logs.feeCharged.length === 0 &&
        logs.feeRefunded.length === 0 && (
          <p className="text-sm text-zinc-500">No matching events found in logs.</p>
        )}
    </div>
  );
}

export default function TxAnalyzerPage() {
  const [txHash, setTxHash] = useState("");
  const [networkIdx, setNetworkIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<TxAnalysis | null>(null);

  const network = NETWORKS[networkIdx];
  const isValidHash = /^0x[a-fA-F0-9]{64}$/.test(txHash);

  async function handleAnalyze() {
    setError(null);
    setAnalysis(null);
    setLoading(true);
    try {
      const result = await analyzeTx(txHash, network.rpcKey, network.name);
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-2xl font-bold">Transaction Analyzer</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Decode and analyze FeeModule.matchOrders transactions
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          {/* Input Section */}
          <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">Analyze Transaction</h3>
              <p className="mt-1 text-sm text-zinc-500">
                Paste a transaction hash from a FeeModule.matchOrders call
              </p>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <Label className="text-sm font-medium">Network</Label>
                <div className="mt-1.5 flex gap-2">
                  {NETWORKS.map((n, i) => (
                    <Button
                      key={n.name}
                      variant={networkIdx === i ? "default" : "outline"}
                      size="sm"
                      onClick={() => setNetworkIdx(i)}
                    >
                      {n.name}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Transaction Hash</Label>
                <Input
                  placeholder="0x..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value.trim())}
                  className="mt-1.5 font-mono text-sm"
                />
                {txHash && !isValidHash && (
                  <p className="mt-1 text-xs text-red-500">Invalid transaction hash</p>
                )}
              </div>
              <Button onClick={handleAnalyze} disabled={!isValidHash || loading} className="w-full">
                {loading ? "Analyzing..." : "Analyze Transaction"}
              </Button>
              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          {analysis && (
            <>
              {/* Tx Summary */}
              <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold">Transaction Summary</h3>
                    <Badge
                      variant="secondary"
                      className={
                        analysis.status === 1
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }
                    >
                      {analysis.status === 1 ? "Success" : "Failed"}
                    </Badge>
                    <Badge variant="outline">{analysis.network}</Badge>
                    <Badge variant="outline">ABI {analysis.abiVersion}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 p-6 text-sm">
                  <div>
                    <span className="text-zinc-500">Tx Hash:</span>{" "}
                    <a
                      href={`${network.explorer}/tx/${analysis.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {shortenAddr(analysis.txHash)}
                    </a>
                  </div>
                  <div>
                    <span className="text-zinc-500">Block:</span>{" "}
                    <span className="font-mono">{analysis.blockNumber}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">From:</span>{" "}
                    <a
                      href={`${network.explorer}/address/${analysis.from}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {shortenAddr(analysis.from)}
                    </a>
                  </div>
                  <div>
                    <span className="text-zinc-500">To (FeeModule):</span>{" "}
                    <a
                      href={`${network.explorer}/address/${analysis.to}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {shortenAddr(analysis.to)}
                    </a>
                  </div>
                  <div>
                    <span className="text-zinc-500">Gas Used:</span>{" "}
                    <span className="font-mono">{Number(analysis.gasUsed).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Maker Orders:</span>{" "}
                    <span className="font-mono">{analysis.makers.length}</span>
                  </div>
                </div>
              </div>

              {/* Parameter Reference */}
              <ParameterReference />

              {/* Settlement Ledger */}
              <AccountantLedger analysis={analysis} />

              {/* Interactive Fee Curve */}
              <FeeCurveExplorer key={analysis.txHash} analysis={analysis} />

              {/* Taker Order */}
              <div>
                <h3 className="mb-3 text-lg font-semibold">Taker Order</h3>
                <OrderCard
                  label="Taker"
                  order={analysis.taker.order}
                  fillAmount={analysis.taker.fillAmount}
                  receiveAmount={analysis.taker.receiveAmount}
                  feeAmount={analysis.taker.feeAmount}
                  feeAnalysis={analysis.taker.feeAnalysis}
                  refund={analysis.taker.refund}
                  refundFormatted={analysis.taker.refundFormatted}
                  explorer={network.explorer}
                />
              </div>

              {/* Maker Orders */}
              <div>
                <h3 className="mb-3 text-lg font-semibold">
                  Maker Orders ({analysis.makers.length})
                </h3>
                <div className="space-y-3">
                  {analysis.makers.map((m) => (
                    <OrderCard
                      key={m.index}
                      label={`Maker #${m.index}`}
                      order={m.order}
                      fillAmount={m.fillAmount}
                      feeAmount={m.feeAmount}
                      feeAnalysis={m.feeAnalysis}
                      refund={m.refund}
                      refundFormatted={m.refundFormatted}
                      explorer={network.explorer}
                    />
                  ))}
                </div>
              </div>

              {/* Event Logs */}
              <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                  <h3 className="text-lg font-semibold">Event Logs</h3>
                </div>
                <div className="p-6">
                  <LogsSection analysis={analysis} />
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
