"use server";

import { Wallet, JsonRpcProvider, Contract, MaxUint256 } from "ethers";
import { ClobClient, type ApiKeyCreds, Side, OrderType, SignatureType } from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { deriveProxyWallet } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { CLOB_API_HOST, CHAIN_ID, POLYGON_RPC, CONTRACTS } from "./config";

// Wrap ethers v6 Wallet to match ClobClient's expected signer interface (ethers v5 style)
function createClobSigner(privateKey: string) {
  const wallet = new Wallet(privateKey);
  return {
    _signTypedData: (
      domain: Record<string, unknown>,
      types: Record<string, Array<{ name: string; type: string }>>,
      value: Record<string, unknown>
    ) => wallet.signTypedData(domain, types, value),
    getAddress: () => Promise.resolve(wallet.address),
  };
}

function getBuilderConfig() {
  const key = process.env.POLY_BUILDER_API_KEY;
  const secret = process.env.POLY_BUILDER_API_SECRET;
  const passphrase = process.env.POLY_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) return undefined;
  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}

function createClient(privateKey: string, creds?: ApiKeyCreds) {
  const signer = createClobSigner(privateKey);
  const builderConfig = getBuilderConfig();
  const wallet = new Wallet(privateKey);
  const proxyAddress = deriveProxyWallet(wallet.address, CONTRACTS.proxyFactory);
  return new ClobClient(
    CLOB_API_HOST,
    CHAIN_ID as any,
    signer as any,
    creds,
    SignatureType.POLY_PROXY, // proxy wallet signature type
    proxyAddress,             // funderAddress = proxy wallet (holds the funds)
    undefined, // geoBlockToken
    true,      // useServerTime
    builderConfig,
  );
}

// Connect wallet: derive L2 API credentials
export async function connectWallet(privateKey: string): Promise<{
  success: boolean;
  address?: string;
  creds?: ApiKeyCreds;
  error?: string;
}> {
  try {
    const wallet = new Wallet(privateKey);
    const client = createClient(privateKey);
    const creds = await client.createOrDeriveApiKey();
    return { success: true, address: wallet.address, creds };
  } catch (e: any) {
    return { success: false, error: e.message || "Failed to connect" };
  }
}

// Get balance and allowance
export async function getBalance(
  privateKey: string,
  creds: ApiKeyCreds
): Promise<{ balance: string; allowance: string }> {
  const client = createClient(privateKey, creds);
  const res = await client.getBalanceAllowance({
    asset_type: "COLLATERAL" as any,
  });
  return { balance: res.balance, allowance: res.allowance };
}

// Get native POL + USDC balances for both EOA and proxy wallet
export async function getWalletBalances(privateKey: string): Promise<{
  eoaAddress: string;
  proxyAddress: string;
  eoaPolBalance: string;
  eoaUsdcBalance: string;
  proxyPolBalance: string;
  proxyUsdcBalance: string;
}> {
  const wallet = new Wallet(privateKey);
  const eoaAddr = wallet.address;
  const proxyAddr = deriveProxyWallet(eoaAddr, CONTRACTS.proxyFactory);
  const provider = getProvider();
  const usdc = new Contract(CONTRACTS.collateral, ERC20_READ_ABI, provider);

  const [eoaPol, proxyPol, eoaUsdc, proxyUsdc] = await Promise.all([
    provider.getBalance(eoaAddr),
    provider.getBalance(proxyAddr),
    usdc.balanceOf(eoaAddr) as Promise<bigint>,
    usdc.balanceOf(proxyAddr) as Promise<bigint>,
  ]);

  return {
    eoaAddress: eoaAddr,
    proxyAddress: proxyAddr,
    eoaPolBalance: eoaPol.toString(),
    eoaUsdcBalance: eoaUsdc.toString(),
    proxyPolBalance: proxyPol.toString(),
    proxyUsdcBalance: proxyUsdc.toString(),
  };
}

// Derive proxy wallet address from EOA
export async function getProxyAddress(privateKey: string): Promise<string> {
  const wallet = new Wallet(privateKey);
  return deriveProxyWallet(wallet.address, CONTRACTS.proxyFactory);
}

// Get open orders
export async function getOpenOrders(
  privateKey: string,
  creds: ApiKeyCreds,
  marketFilter?: string
) {
  const client = createClient(privateKey, creds);

  // Debug: check builder config validity
  const builderValid = (client as any).builderConfig?.isValid?.() ?? false;
  const sigType = (client as any).orderBuilder?.signatureType;
  const funder = (client as any).orderBuilder?.funderAddress;
  console.log(`[orders] builderValid=${builderValid} sigType=${sigType} funder=${funder?.slice(0, 10)}`);

  const params = marketFilter ? { market: marketFilter } : undefined;
  try {
    const orders = await client.getOpenOrders(params);
    console.log(`[orders] getOpenOrders returned: ${Array.isArray(orders) ? orders.length : typeof orders} items`);
    if (Array.isArray(orders)) {
      return JSON.parse(JSON.stringify(orders));
    }
    console.log(`[orders] Unexpected response:`, JSON.stringify(orders)?.slice(0, 500));
    return [];
  } catch (e: any) {
    console.error("[orders] getOpenOrders failed:", e?.message || e);
    // If CLOB client fails, try data-api.polymarket.com/activity as last resort
    return [];
  }
}

// NOTE: getTrades and getPositions moved to client-side lib/polymarket/gamma-client.ts (uses data-api.polymarket.com)

// Get order book
export async function getOrderBook(tokenId: string) {
  const client = new ClobClient(CLOB_API_HOST, CHAIN_ID as any);
  return client.getOrderBook(tokenId);
}

// Place a limit order (GTC)
export async function placeLimitOrder(
  privateKey: string,
  creds: ApiKeyCreds,
  params: {
    tokenID: string;
    price: number;
    size: number;
    side: "BUY" | "SELL";
    tickSize?: string;
    negRisk?: boolean;
    feeRateBps?: number;
  }
) {
  if (!params.tokenID) {
    return { success: false, errorMsg: "Missing tokenID — market data may not have loaded correctly" };
  }
  console.log("[placeLimitOrder] Sending:", JSON.stringify({
    tokenID: params.tokenID,
    price: params.price,
    size: params.size,
    side: params.side,
    tickSize: params.tickSize,
    negRisk: params.negRisk,
    feeRateBps: params.feeRateBps,
  }));
  const client = createClient(privateKey, creds);
  // Override _resolveFeeRateBps so our feeRateBps is used in the signed order
  if (params.feeRateBps !== undefined) {
    (client as any)._resolveFeeRateBps = async () => params.feeRateBps;
  }
  const result = await client.createAndPostOrder(
    {
      tokenID: params.tokenID,
      price: params.price,
      size: params.size,
      side: params.side === "BUY" ? Side.BUY : Side.SELL,
      feeRateBps: params.feeRateBps,
    },
    {
      tickSize: (params.tickSize || "0.01") as any,
      negRisk: params.negRisk,
    },
    OrderType.GTC,
  );
  console.log("[placeLimitOrder] Response:", JSON.stringify(result));
  return result;
}

// Place a market order (GTC — stays on book until filled or cancelled)
export async function placeMarketOrder(
  privateKey: string,
  creds: ApiKeyCreds,
  params: {
    tokenID: string;
    amount: number;
    side: "BUY" | "SELL";
    tickSize?: string;
    negRisk?: boolean;
    feeRateBps?: number;
    price?: number;
  }
) {
  if (!params.tokenID) {
    return { success: false, errorMsg: "Missing tokenID — market data may not have loaded correctly" };
  }
  // For SELL, use price floor of 0.01; for BUY, use price ceiling of 0.99
  const price = params.price ?? (params.side === "SELL" ? 0.01 : 0.99);
  console.log("[placeMarketOrder] Sending GTC:", JSON.stringify({
    tokenID: params.tokenID,
    amount: params.amount,
    price,
    side: params.side,
    tickSize: params.tickSize,
    negRisk: params.negRisk,
    feeRateBps: params.feeRateBps,
  }));
  const client = createClient(privateKey, creds);
  if (params.feeRateBps !== undefined) {
    (client as any)._resolveFeeRateBps = async () => params.feeRateBps;
  }
  const result = await client.createAndPostOrder(
    {
      tokenID: params.tokenID,
      price,
      size: params.amount,
      side: params.side === "BUY" ? Side.BUY : Side.SELL,
      feeRateBps: params.feeRateBps,
    },
    {
      tickSize: (params.tickSize || "0.01") as any,
      negRisk: params.negRisk,
    },
    OrderType.GTC,
  );
  console.log("[placeMarketOrder] Response:", JSON.stringify(result));
  return result;
}

// Cancel an order
export async function cancelOrder(
  privateKey: string,
  creds: ApiKeyCreds,
  orderId: string
) {
  const client = createClient(privateKey, creds);
  return client.cancelOrder({ orderID: orderId });
}

// ─── Deposit USDC.e from EOA to Proxy Wallet ───

const ERC20_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

export async function depositToProxy(
  privateKey: string,
  amountUsdc: string,
): Promise<TxResult> {
  try {
    const wallet = new Wallet(privateKey);
    const proxyAddr = deriveProxyWallet(wallet.address, CONTRACTS.proxyFactory);
    const provider = getProvider();
    const signer = wallet.connect(provider);

    // Convert human-readable USDC amount to 6-decimal raw amount
    const rawAmount = BigInt(Math.round(Number(amountUsdc) * 1e6));
    if (rawAmount <= BigInt(0)) {
      return { success: false, error: "Amount must be greater than 0", method: "direct" };
    }

    // Check EOA has enough USDC
    const usdc = new Contract(CONTRACTS.collateral, ERC20_READ_ABI, provider);
    const balance = await usdc.balanceOf(wallet.address) as bigint;
    if (balance < rawAmount) {
      const available = (Number(balance) / 1e6).toFixed(2);
      return { success: false, error: `Insufficient USDC.e balance. Available: ${available}`, method: "direct" };
    }

    console.log(`[deposit] Transferring ${amountUsdc} USDC.e from ${wallet.address} to proxy ${proxyAddr}`);
    const usdcWrite = new Contract(CONTRACTS.collateral, ERC20_TRANSFER_ABI, signer);
    const tx = await usdcWrite.transfer(proxyAddr, rawAmount);
    console.log(`[deposit] Tx sent: ${tx.hash}, waiting...`);
    await tx.wait(1);
    console.log(`[deposit] Confirmed: ${tx.hash}`);
    return { success: true, hash: tx.hash, method: "direct" };
  } catch (e: unknown) {
    console.error("[deposit] Failed:", e);
    return { success: false, error: extractError(e), method: "direct" };
  }
}

// NOTE: fetchEvents moved to client-side lib/polymarket/gamma-client.ts (via /api/gamma proxy)

// Cancel all orders
export async function cancelAllOrders(
  privateKey: string,
  creds: ApiKeyCreds
) {
  const client = createClient(privateKey, creds);
  return client.cancelAll();
}

// ─── Approval Actions (Gasless via Relayer + Direct Fallback) ──────────────

import { RelayClient, RelayerTxType, type Transaction as RelayTx } from "@polymarket/builder-relayer-client";
import {
  createWalletClient,
  http,
  encodeFunctionData,
  maxUint256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";

const ERC20_READ_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
];

const ERC1155_READ_ABI = [
  "function isApprovedForAll(address account, address operator) view returns (bool)",
];

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ERC1155_APPROVE_ABI = [
  {
    name: "setApprovalForAll",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

function getProvider() {
  const rpc = process.env.POLYGON_RPC_URL || POLYGON_RPC;
  return new JsonRpcProvider(rpc, 137, { staticNetwork: true });
}

function extractError(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message;
    if (msg.length > 300) return msg.slice(0, 300) + "...";
    return msg;
  }
  return String(e);
}

function createRelayClient(privateKey: string) {
  const relayerUrl = process.env.RELAYER_URL;
  if (!relayerUrl) return null;

  const rpc = process.env.POLYGON_RPC_URL || POLYGON_RPC;
  const account = privateKeyToAccount(privateKey as Hex);
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpc),
  });

  const builderConfig = getBuilderConfig();
  return new RelayClient(
    relayerUrl,
    CHAIN_ID,
    wallet,
    builderConfig as any,
    RelayerTxType.PROXY,
  );
}

export interface ApprovalStatus {
  eoaAddress: string;
  proxyWalletAddress: string;
  usdcBalanceRaw: string;
  usdcBalance: string;
  exchangeAllowanceRaw: string;
  exchangeAllowanceFormatted: string;
  exchangeApproved: boolean;
  negRiskExchangeAllowanceRaw: string;
  negRiskExchangeAllowanceFormatted: string;
  negRiskExchangeApproved: boolean;
  negRiskAdapterAllowanceRaw: string;
  negRiskAdapterAllowanceFormatted: string;
  negRiskAdapterApproved: boolean;
  ctfExchangeApproved: boolean;
  ctfNegRiskExchangeApproved: boolean;
  ctfNegRiskAdapterApproved: boolean;
  relayerAvailable: boolean;
}

export interface TxResult {
  success: boolean;
  hash?: string;
  relayTxId?: string;
  error?: string;
  method: "relayer" | "direct";
}

// Check all approval statuses on the proxy wallet (derived from EOA via CREATE2)
export async function checkApprovals(privateKey: string): Promise<ApprovalStatus> {
  const wallet = new Wallet(privateKey);
  const eoaAddress = wallet.address;
  const proxyAddress = deriveProxyWallet(eoaAddress, CONTRACTS.proxyFactory);
  const provider = getProvider();

  console.log(`[approvals] EOA: ${eoaAddress}, Proxy: ${proxyAddress}`);

  const usdc = new Contract(CONTRACTS.collateral, ERC20_READ_ABI, provider);
  const ct = new Contract(CONTRACTS.conditionalTokens, ERC1155_READ_ABI, provider);

  // Check allowances on the PROXY wallet address (not EOA)
  const [
    usdcBalanceRaw,
    exchangeAllowance,
    negRiskExchangeAllowance,
    negRiskAdapterAllowance,
    ctfExchangeApproved,
    ctfNegRiskExchangeApproved,
    ctfNegRiskAdapterApproved,
  ] = await Promise.all([
    usdc.balanceOf(proxyAddress) as Promise<bigint>,
    usdc.allowance(proxyAddress, CONTRACTS.exchange) as Promise<bigint>,
    usdc.allowance(proxyAddress, CONTRACTS.negRiskExchange) as Promise<bigint>,
    usdc.allowance(proxyAddress, CONTRACTS.negRiskAdapter) as Promise<bigint>,
    ct.isApprovedForAll(proxyAddress, CONTRACTS.exchange) as Promise<boolean>,
    ct.isApprovedForAll(proxyAddress, CONTRACTS.negRiskExchange) as Promise<boolean>,
    ct.isApprovedForAll(proxyAddress, CONTRACTS.negRiskAdapter) as Promise<boolean>,
  ]);

  const threshold = BigInt(1e18);

  // Format USDC allowance (6 decimals) — cap display at "Unlimited" for max uint
  const maxUint = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  function formatAllowance(raw: bigint): string {
    if (raw === maxUint || raw >= BigInt("1" + "0".repeat(70))) return "Unlimited";
    if (raw === BigInt(0)) return "0";
    const num = Number(raw) / 1e6;
    if (num >= 1e12) return `${(num / 1e12).toFixed(6)}T`;
    if (num >= 1e9) return `${(num / 1e9).toFixed(6)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(6)}M`;
    return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  return {
    eoaAddress,
    proxyWalletAddress: proxyAddress,
    usdcBalanceRaw: usdcBalanceRaw.toString(),
    usdcBalance: (Number(usdcBalanceRaw) / 1e6).toFixed(2),
    exchangeAllowanceRaw: exchangeAllowance.toString(),
    exchangeAllowanceFormatted: formatAllowance(exchangeAllowance),
    exchangeApproved: exchangeAllowance >= threshold,
    negRiskExchangeAllowanceRaw: negRiskExchangeAllowance.toString(),
    negRiskExchangeAllowanceFormatted: formatAllowance(negRiskExchangeAllowance),
    negRiskExchangeApproved: negRiskExchangeAllowance >= threshold,
    negRiskAdapterAllowanceRaw: negRiskAdapterAllowance.toString(),
    negRiskAdapterAllowanceFormatted: formatAllowance(negRiskAdapterAllowance),
    negRiskAdapterApproved: negRiskAdapterAllowance >= threshold,
    ctfExchangeApproved,
    ctfNegRiskExchangeApproved,
    ctfNegRiskAdapterApproved,
    relayerAvailable: !!process.env.RELAYER_URL,
  };
}

// ─── Relayer-based approval (gasless via proxy wallet) ───

function buildERC20ApproveTx(token: string, spender: string): RelayTx {
  const data = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender as Hex, maxUint256],
  });
  return { to: token, data, value: "0" };
}

function buildERC1155ApproveTx(token: string, operator: string): RelayTx {
  const data = encodeFunctionData({
    abi: ERC1155_APPROVE_ABI,
    functionName: "setApprovalForAll",
    args: [operator as Hex, true],
  });
  return { to: token, data, value: "0" };
}

async function relayApproval(
  privateKey: string,
  txns: RelayTx[],
  metadata: string,
): Promise<TxResult> {
  try {
    const relay = createRelayClient(privateKey);
    if (!relay) {
      return { success: false, error: "RELAYER_URL not configured", method: "relayer" };
    }
    console.log(`[relay] Sending ${metadata}...`);
    const resp = await relay.execute(txns, metadata);
    console.log(`[relay] Submitted: txId=${resp.transactionID}, waiting...`);
    const result = await resp.wait();
    if (result) {
      console.log(`[relay] Confirmed: ${result.transactionHash}`);
      return {
        success: true,
        hash: result.transactionHash,
        relayTxId: result.transactionID,
        method: "relayer",
      };
    }
    return { success: false, error: "Relay transaction failed on-chain", method: "relayer" };
  } catch (e: unknown) {
    console.error(`[relay] Failed:`, e);
    return { success: false, error: extractError(e), method: "relayer" };
  }
}

// ─── Direct on-chain fallback ───

async function sendDirectTx(
  privateKey: string,
  contractAddr: string,
  abi: string[],
  method: string,
  args: unknown[],
): Promise<TxResult> {
  try {
    const signer = new Wallet(privateKey, getProvider());
    const contract = new Contract(contractAddr, abi, signer);
    console.log(`[direct] Sending ${method} to ${contractAddr}...`);
    const tx = await contract[method](...args);
    console.log(`[direct] Tx sent: ${tx.hash}, waiting...`);
    await tx.wait(1);
    console.log(`[direct] Confirmed: ${tx.hash}`);
    return { success: true, hash: tx.hash, method: "direct" };
  } catch (e: unknown) {
    console.error(`[direct] Failed:`, e);
    return { success: false, error: extractError(e), method: "direct" };
  }
}

// ─── Exported approval actions (try relayer first, fallback to direct) ───

export async function approveUSDCForExchange(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.exchange);
    return relayApproval(privateKey, [tx], "approve USDC → CTF Exchange");
  }
  return sendDirectTx(privateKey, CONTRACTS.collateral, [
    "function approve(address spender, uint256 amount) returns (bool)",
  ], "approve", [CONTRACTS.exchange, MaxUint256]);
}

export async function approveUSDCForNegRiskExchange(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskExchange);
    return relayApproval(privateKey, [tx], "approve USDC → NegRisk Exchange");
  }
  return sendDirectTx(privateKey, CONTRACTS.collateral, [
    "function approve(address spender, uint256 amount) returns (bool)",
  ], "approve", [CONTRACTS.negRiskExchange, MaxUint256]);
}

export async function approveUSDCForNegRiskAdapter(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskAdapter);
    return relayApproval(privateKey, [tx], "approve USDC → NegRisk Adapter");
  }
  return sendDirectTx(privateKey, CONTRACTS.collateral, [
    "function approve(address spender, uint256 amount) returns (bool)",
  ], "approve", [CONTRACTS.negRiskAdapter, MaxUint256]);
}

export async function approveConditionalTokensForExchange(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.exchange);
    return relayApproval(privateKey, [tx], "setApprovalForAll CT → CTF Exchange");
  }
  return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
    "function setApprovalForAll(address operator, bool approved)",
  ], "setApprovalForAll", [CONTRACTS.exchange, true]);
}

export async function approveConditionalTokensForNegRiskExchange(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskExchange);
    return relayApproval(privateKey, [tx], "setApprovalForAll CT → NegRisk Exchange");
  }
  return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
    "function setApprovalForAll(address operator, bool approved)",
  ], "setApprovalForAll", [CONTRACTS.negRiskExchange, true]);
}

export async function approveConditionalTokensForNegRiskAdapter(privateKey: string): Promise<TxResult> {
  if (process.env.RELAYER_URL) {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskAdapter);
    return relayApproval(privateKey, [tx], "setApprovalForAll CT → NegRisk Adapter");
  }
  return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
    "function setApprovalForAll(address operator, bool approved)",
  ], "setApprovalForAll", [CONTRACTS.negRiskAdapter, true]);
}

// Batch approve all 4 in one go via relayer (2 relay calls: ERC20 + ERC1155)
export async function approveAllViaRelayer(privateKey: string): Promise<TxResult[]> {
  const results: TxResult[] = [];

  // Batch ERC20 approvals (exchange + negRiskExchange + negRiskAdapter in one relay call)
  const erc20Txns = [
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.exchange),
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskExchange),
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskAdapter),
  ];
  results.push(await relayApproval(privateKey, erc20Txns, "approve USDC → exchanges + adapter"));

  // Batch ERC1155 approvals (exchanges + adapter in one relay call)
  const erc1155Txns = [
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.exchange),
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskExchange),
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskAdapter),
  ];
  results.push(await relayApproval(privateKey, erc1155Txns, "setApprovalForAll CT → exchanges + adapter"));

  return results;
}
