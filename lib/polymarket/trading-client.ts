// Client-side order placement — runs in the browser, no server round-trip
import { ClobClient, type ApiKeyCreds, Side, OrderType, SignatureType } from "@polymarket/clob-client";
import { BuilderConfig } from "@polymarket/builder-signing-sdk";
import { deriveProxyWallet } from "@polymarket/builder-relayer-client/dist/builder/derive";
import { Wallet } from "ethers";
import { CLOB_API_HOST, CHAIN_ID, CONTRACTS } from "./config";

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
  const key = process.env.NEXT_PUBLIC_POLY_BUILDER_API_KEY;
  const secret = process.env.NEXT_PUBLIC_POLY_BUILDER_API_SECRET;
  const passphrase = process.env.NEXT_PUBLIC_POLY_BUILDER_PASSPHRASE;
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
    SignatureType.POLY_PROXY,
    proxyAddress,
    undefined, // geoBlockToken
    true,      // useServerTime
    builderConfig,
  );
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
  privateKey: string,
  creds: ApiKeyCreds,
  orderId: string
) {
  const client = createClient(privateKey, creds);
  return client.cancelOrder({ orderID: orderId });
}
