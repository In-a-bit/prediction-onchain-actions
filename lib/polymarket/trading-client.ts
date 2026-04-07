// Client-side order placement — runs in the browser, no server round-trip
import { ClobClient, type ApiKeyCreds, Side, OrderType, SignatureType } from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { deriveProxyWallet } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { Wallet, BrowserProvider } from "ethers";
import { CLOB_API_HOST, CHAIN_ID, CONTRACTS } from "./config";

// Signer interface expected by ClobClient (ethers v5 style)
interface ClobSigner {
  _signTypedData: (
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    value: Record<string, unknown>
  ) => Promise<string>;
  getAddress: () => Promise<string>;
}

function createClobSigner(privateKey: string): ClobSigner {
  const wallet = new Wallet(privateKey);
  return {
    _signTypedData: (domain, types, value) => wallet.signTypedData(domain, types, value),
    getAddress: () => Promise.resolve(wallet.address),
  };
}

// Create a ClobSigner from MetaMask (window.ethereum)
export function createMetaMaskSigner(address: string): ClobSigner {
  return {
    _signTypedData: async (domain, types, value) => {
      if (!window.ethereum) throw new Error("MetaMask not available");
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner(address);
      return signer.signTypedData(domain, types, value);
    },
    getAddress: () => Promise.resolve(address),
  };
}

// Store a signer reference for MetaMask mode (set by connectMetaMask)
let _mmSigner: ClobSigner | null = null;
let _mmAddress: string | null = null;

export function setMetaMaskSigner(address: string) {
  _mmAddress = address;
  _mmSigner = createMetaMaskSigner(address);
}

export function clearMetaMaskSigner() {
  _mmSigner = null;
  _mmAddress = null;
}

export function getMetaMaskAddress(): string | null {
  return _mmAddress;
}

function getBuilderConfig() {
  const key = process.env.NEXT_PUBLIC_POLY_BUILDER_API_KEY;
  const secret = process.env.NEXT_PUBLIC_POLY_BUILDER_API_SECRET;
  const passphrase = process.env.NEXT_PUBLIC_POLY_BUILDER_PASSPHRASE;
  if (!key || !secret || !passphrase) return undefined;
  return new BuilderConfig({
    localBuilderCreds: { key, secret, passphrase },
  });
}

function createClient(privateKeyOrAddress: string, creds?: ApiKeyCreds) {
  const builderConfig = getBuilderConfig();

  // If MetaMask signer is active and address matches, use it
  if (_mmSigner && _mmAddress && privateKeyOrAddress.toLowerCase() === _mmAddress.toLowerCase()) {
    const proxyAddress = deriveProxyWallet(_mmAddress, CONTRACTS.proxyFactory);
    return new ClobClient(
      CLOB_API_HOST,
      CHAIN_ID as any,
      _mmSigner as any,
      creds,
      SignatureType.POLY_PROXY,
      proxyAddress,
      undefined,
      true,
      builderConfig,
    );
  }

  // Fallback: private key mode
  const signer = createClobSigner(privateKeyOrAddress);
  const wallet = new Wallet(privateKeyOrAddress);
  const proxyAddress = deriveProxyWallet(wallet.address, CONTRACTS.proxyFactory);
  return new ClobClient(
    CLOB_API_HOST,
    CHAIN_ID as any,
    signer as any,
    creds,
    SignatureType.POLY_PROXY,
    proxyAddress,
    undefined,
    true,
    builderConfig,
  );
}

// Ensure MetaMask is on Polygon network
async function ensurePolygonNetwork() {
  if (!window.ethereum) throw new Error("MetaMask not available");
  const POLYGON_CHAIN_ID = "0x89"; // 137 in hex
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: POLYGON_CHAIN_ID }],
    });
  } catch (switchError: any) {
    // Chain not added to MetaMask — add it
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: POLYGON_CHAIN_ID,
          chainName: "Polygon Mainnet",
          nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
          rpcUrls: ["https://polygon-rpc.com"],
          blockExplorerUrls: ["https://polygonscan.com"],
        }],
      });
    } else {
      throw switchError;
    }
  }
}

// Connect via MetaMask — derives API keys using MetaMask signing
export async function connectMetaMask(address: string): Promise<{
  success: boolean;
  creds?: ApiKeyCreds;
  proxyAddress?: string;
  error?: string;
}> {
  try {
    await ensurePolygonNetwork();
    setMetaMaskSigner(address);
    const signer = _mmSigner!;
    const proxyAddress = deriveProxyWallet(address, CONTRACTS.proxyFactory);
    const builderConfig = getBuilderConfig();

    const client = new ClobClient(
      CLOB_API_HOST,
      CHAIN_ID as any,
      signer as any,
      undefined,
      SignatureType.POLY_PROXY,
      proxyAddress,
      undefined,
      true,
      builderConfig,
    );

    const creds = await client.createOrDeriveApiKey();
    return { success: true, creds, proxyAddress };
  } catch (e: any) {
    clearMetaMaskSigner();
    return { success: false, error: e.message || "MetaMask connection failed" };
  }
}

export async function placeLimitOrderClient(
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
    return { success: false, errorMsg: "Missing tokenID" };
  }
  console.log("[client-trade] placeLimitOrder:", JSON.stringify({
    tokenID: params.tokenID.slice(0, 20) + "...",
    price: params.price,
    size: params.size,
    side: params.side,
    feeRateBps: params.feeRateBps,
  }));
  const client = createClient(privateKey, creds);
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
  console.log("[client-trade] Response:", JSON.stringify(result));
  return result;
}

export async function placeMarketOrderClient(
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
    return { success: false, errorMsg: "Missing tokenID" };
  }
  const price = params.price ?? (params.side === "SELL" ? 0.01 : 0.99);
  console.log("[client-trade] placeMarketOrder GTC:", JSON.stringify({
    tokenID: params.tokenID.slice(0, 20) + "...",
    amount: params.amount,
    price,
    side: params.side,
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
  console.log("[client-trade] Response:", JSON.stringify(result));
  return result;
}

export async function cancelOrderClient(
  privateKeyOrAddress: string,
  creds: ApiKeyCreds,
  orderId: string
) {
  const client = createClient(privateKeyOrAddress, creds);
  return client.cancelOrder({ orderID: orderId });
}

// Client-side balance check (works with both private key and MetaMask address)
export async function getBalanceClient(
  privateKeyOrAddress: string,
  creds: ApiKeyCreds,
): Promise<{ balance: string; allowance: string }> {
  const client = createClient(privateKeyOrAddress, creds);
  const res = await client.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
  return { balance: res.balance, allowance: res.allowance };
}

// Client-side wallet balances (read-only RPC, address only)
export async function getWalletBalancesClient(address: string): Promise<{
  eoaAddress: string;
  proxyAddress: string;
  eoaPolBalance: string;
  eoaUsdcBalance: string;
  proxyPolBalance: string;
  proxyUsdcBalance: string;
}> {
  const { JsonRpcProvider, Contract } = await import("ethers");
  const { POLYGON_RPC, CONTRACTS } = await import("./config");
  const rpc = process.env.NEXT_PUBLIC_POLYGON_RPC_URL || POLYGON_RPC;
  const provider = new JsonRpcProvider(rpc, 137, { staticNetwork: true });
  const proxyAddr = deriveProxyWallet(address, CONTRACTS.proxyFactory);
  const usdc = new Contract(CONTRACTS.collateral, [
    "function balanceOf(address) view returns (uint256)",
  ], provider);

  const [eoaPol, proxyPol, eoaUsdc, proxyUsdc] = await Promise.all([
    provider.getBalance(address),
    provider.getBalance(proxyAddr),
    usdc.balanceOf(address) as Promise<bigint>,
    usdc.balanceOf(proxyAddr) as Promise<bigint>,
  ]);

  return {
    eoaAddress: address,
    proxyAddress: proxyAddr,
    eoaPolBalance: eoaPol.toString(),
    eoaUsdcBalance: eoaUsdc.toString(),
    proxyPolBalance: proxyPol.toString(),
    proxyUsdcBalance: proxyUsdc.toString(),
  };
}

// Client-side open orders (works with both private key and MetaMask address)
export async function getOpenOrdersClient(
  privateKeyOrAddress: string,
  creds: ApiKeyCreds,
) {
  const client = createClient(privateKeyOrAddress, creds);
  try {
    const orders = await client.getOpenOrders();
    return Array.isArray(orders) ? orders : [];
  } catch (e: any) {
    console.error("[client] getOpenOrders failed:", e?.message || e);
    return [];
  }
}
