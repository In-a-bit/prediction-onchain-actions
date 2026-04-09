// Client-side approval checking and execution — no server round-trip
import { Wallet, JsonRpcProvider, BrowserProvider, Contract, MaxUint256 } from "ethers";
import { deriveProxyWallet } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { RelayClient, RelayerTxType, type Transaction as RelayTx } from "@polymarket/builder-relayer-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import {
  createWalletClient,
  http,
  custom,
  encodeFunctionData,
  maxUint256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { CHAIN_ID, POLYGON_RPC, CONTRACTS } from "./config";

function isAddressOnly(input: string): boolean {
  return input.length === 42 && input.startsWith("0x");
}

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

const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
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

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_POLYGON_RPC_URL || POLYGON_RPC;
}

function getProvider() {
  return new JsonRpcProvider(getRpcUrl(), 137, { staticNetwork: true });
}

function extractError(e: unknown): string {
  if (e instanceof Error) {
    const msg = e.message;
    if (msg.length > 300) return msg.slice(0, 300) + "...";
    return msg;
  }
  return String(e);
}

const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || "https://relayer-v2.polymarket.com";

function getBuilderConfig() {
  const key = process.env.NEXT_PUBLIC_POLY_BUILDER_API_KEY;
  const secret = process.env.NEXT_PUBLIC_POLY_BUILDER_API_SECRET;
  const passphrase = process.env.NEXT_PUBLIC_POLY_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) return undefined;
  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}

function createRelayClient(privateKeyOrAddress: string) {
  const builderConfig = getBuilderConfig();

  if (isAddressOnly(privateKeyOrAddress)) {
    // MetaMask mode — use window.ethereum as transport, MetaMask signs
    if (typeof window === "undefined" || !window.ethereum) {
      throw new Error("MetaMask not available for relay signing");
    }
    const wallet = createWalletClient({
      account: privateKeyOrAddress as Hex,
      chain: polygon,
      transport: custom(window.ethereum),
    });
    return new RelayClient(
      RELAYER_URL,
      CHAIN_ID,
      wallet,
      builderConfig as any,
      RelayerTxType.PROXY,
    );
  }

  // Private key mode
  const pk = (privateKeyOrAddress.startsWith("0x") ? privateKeyOrAddress : `0x${privateKeyOrAddress}`) as Hex;
  const account = privateKeyToAccount(pk);
  const wallet = createWalletClient({
    account,
    chain: polygon,
    transport: http(getRpcUrl()),
  });
  return new RelayClient(
    RELAYER_URL,
    CHAIN_ID,
    wallet,
    builderConfig as any,
    RelayerTxType.PROXY,
  );
}

// ─── Types ───

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

// ─── Check Approvals (read-only, public RPC) ───

export async function checkApprovals(privateKeyOrAddress: string): Promise<ApprovalStatus> {
  // Accept either a private key or an address
  const isAddress = privateKeyOrAddress.length === 42 && privateKeyOrAddress.startsWith("0x");
  const eoaAddress = isAddress ? privateKeyOrAddress : new Wallet(privateKeyOrAddress).address;
  const proxyAddress = deriveProxyWallet(eoaAddress, CONTRACTS.proxyFactory);
  const provider = getProvider();

  console.log(`[approvals-client] EOA: ${eoaAddress}, Proxy: ${proxyAddress}`);

  const usdc = new Contract(CONTRACTS.collateral, ERC20_READ_ABI, provider);
  const ct = new Contract(CONTRACTS.conditionalTokens, ERC1155_READ_ABI, provider);

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
  const maxUintVal = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

  function formatAllowance(raw: bigint): string {
    if (raw === maxUintVal || raw >= BigInt("1" + "0".repeat(70))) return "Unlimited";
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
    relayerAvailable: true,
  };
}

// ─── Approval Execution (via relayer — gasless) ───

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
    console.log(`[relay-client] Sending ${metadata}...`);
    const resp = await relay.execute(txns, metadata);
    console.log(`[relay-client] Submitted: txId=${resp.transactionID}, waiting...`);
    const result = await resp.wait();
    if (result) {
      console.log(`[relay-client] Confirmed: ${result.transactionHash}`);
      return {
        success: true,
        hash: result.transactionHash,
        relayTxId: result.transactionID,
        method: "relayer",
      };
    }
    return { success: false, error: "Relay transaction failed on-chain", method: "relayer" };
  } catch (e: unknown) {
    console.error(`[relay-client] Failed:`, e);
    return { success: false, error: extractError(e), method: "relayer" };
  }
}

// Direct on-chain fallback (if relayer fails)
async function sendDirectTx(
  privateKeyOrAddress: string,
  contractAddr: string,
  abi: string[],
  method: string,
  args: unknown[],
): Promise<TxResult> {
  try {
    let signer;
    if (isAddressOnly(privateKeyOrAddress)) {
      // MetaMask mode — get signer from window.ethereum
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("MetaMask not available for direct tx signing");
      }
      const provider = new BrowserProvider(window.ethereum);
      signer = await provider.getSigner(privateKeyOrAddress);
    } else {
      signer = new Wallet(privateKeyOrAddress, getProvider());
    }
    const contract = new Contract(contractAddr, abi, signer);
    console.log(`[direct-client] Sending ${method} to ${contractAddr}...`);
    const tx = await contract[method](...args);
    console.log(`[direct-client] Tx sent: ${tx.hash}, waiting...`);
    await tx.wait(1);
    console.log(`[direct-client] Confirmed: ${tx.hash}`);
    return { success: true, hash: tx.hash, method: "direct" };
  } catch (e: unknown) {
    console.error(`[direct-client] Failed:`, e);
    return { success: false, error: extractError(e), method: "direct" };
  }
}

// ─── Exported approval actions (try relayer first, fallback to direct) ───

export async function approveUSDCForExchange(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.exchange);
    return await relayApproval(privateKey, [tx], "approve USDC → CTF Exchange");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.collateral, [
      "function approve(address spender, uint256 amount) returns (bool)",
    ], "approve", [CONTRACTS.exchange, MaxUint256]);
  }
}

export async function approveUSDCForNegRiskExchange(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskExchange);
    return await relayApproval(privateKey, [tx], "approve USDC → NegRisk Exchange");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.collateral, [
      "function approve(address spender, uint256 amount) returns (bool)",
    ], "approve", [CONTRACTS.negRiskExchange, MaxUint256]);
  }
}

export async function approveUSDCForNegRiskAdapter(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskAdapter);
    return await relayApproval(privateKey, [tx], "approve USDC → NegRisk Adapter");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.collateral, [
      "function approve(address spender, uint256 amount) returns (bool)",
    ], "approve", [CONTRACTS.negRiskAdapter, MaxUint256]);
  }
}

export async function approveConditionalTokensForExchange(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.exchange);
    return await relayApproval(privateKey, [tx], "setApprovalForAll CT → CTF Exchange");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
      "function setApprovalForAll(address operator, bool approved)",
    ], "setApprovalForAll", [CONTRACTS.exchange, true]);
  }
}

export async function approveConditionalTokensForNegRiskExchange(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskExchange);
    return await relayApproval(privateKey, [tx], "setApprovalForAll CT → NegRisk Exchange");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
      "function setApprovalForAll(address operator, bool approved)",
    ], "setApprovalForAll", [CONTRACTS.negRiskExchange, true]);
  }
}

export async function approveConditionalTokensForNegRiskAdapter(privateKey: string): Promise<TxResult> {
  try {
    const tx = buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskAdapter);
    return await relayApproval(privateKey, [tx], "setApprovalForAll CT → NegRisk Adapter");
  } catch {
    return sendDirectTx(privateKey, CONTRACTS.conditionalTokens, [
      "function setApprovalForAll(address operator, bool approved)",
    ], "setApprovalForAll", [CONTRACTS.negRiskAdapter, true]);
  }
}

// ─── Withdraw USDC from Proxy → EOA (via relayer, gasless) ───

export async function withdrawFromProxy(
  privateKeyOrAddress: string,
  amountUsdc: string,
): Promise<TxResult> {
  const isAddr = isAddressOnly(privateKeyOrAddress);
  const eoaAddress = isAddr ? privateKeyOrAddress : new Wallet(privateKeyOrAddress).address;
  const proxyAddress = deriveProxyWallet(eoaAddress, CONTRACTS.proxyFactory);

  const rawAmount = BigInt(Math.round(Number(amountUsdc) * 1e6));
  if (rawAmount <= BigInt(0)) {
    return { success: false, error: "Amount must be greater than 0", method: "relayer" };
  }

  // Check proxy has enough USDC
  const provider = getProvider();
  const usdc = new Contract(CONTRACTS.collateral, ERC20_READ_ABI, provider);
  const balance = await usdc.balanceOf(proxyAddress) as bigint;
  if (balance < rawAmount) {
    const available = (Number(balance) / 1e6).toFixed(2);
    return { success: false, error: `Insufficient proxy USDC.e balance. Available: ${available}`, method: "relayer" };
  }

  // Build transfer tx from proxy → EOA
  const data = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [eoaAddress as Hex, rawAmount],
  });
  const tx: RelayTx = { to: CONTRACTS.collateral, data, value: "0" };

  try {
    return await relayApproval(privateKeyOrAddress, [tx], `withdraw ${amountUsdc} USDC → EOA`);
  } catch {
    // Fallback: direct tx (only works with private key — proxy must have POL for gas)
    return sendDirectTx(privateKeyOrAddress, CONTRACTS.collateral, [
      "function transfer(address to, uint256 amount) returns (bool)",
    ], "transfer", [eoaAddress, rawAmount]);
  }
}

export async function approveAllViaRelayer(privateKey: string): Promise<TxResult[]> {
  const results: TxResult[] = [];

  const erc20Txns = [
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.exchange),
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskExchange),
    buildERC20ApproveTx(CONTRACTS.collateral, CONTRACTS.negRiskAdapter),
  ];
  results.push(await relayApproval(privateKey, erc20Txns, "approve USDC → exchanges + adapter"));

  const erc1155Txns = [
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.exchange),
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskExchange),
    buildERC1155ApproveTx(CONTRACTS.conditionalTokens, CONTRACTS.negRiskAdapter),
  ];
  results.push(await relayApproval(privateKey, erc1155Txns, "setApprovalForAll CT → exchanges + adapter"));

  return results;
}
