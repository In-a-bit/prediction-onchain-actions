"use server";

import { JsonRpcProvider, Wallet, Interface } from "ethers";
import { contracts } from "./registry";

function getProvider() {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not configured");
  return new JsonRpcProvider(rpcUrl);
}

function getSigner(privateKey: string) {
  return new Wallet(privateKey, getProvider());
}

function getAdminKey(contractSlug: string): string | null {
  const config = contracts[contractSlug];
  if (!config?.adminKeyEnv) return null;
  return process.env[config.adminKeyEnv] || null;
}

function getContractAddress(contractSlug: string): string {
  const config = contracts[contractSlug];
  if (!config) throw new Error(`Unknown contract: ${contractSlug}`);
  const address = process.env[config.addressEnv];
  if (!address) throw new Error(`Address not configured: ${config.addressEnv}`);
  return address;
}

export async function callReadFunction(
  contractSlug: string,
  functionName: string,
  args: any[]
): Promise<{ success: true; result: string } | { success: false; error: string }> {
  try {
    const config = contracts[contractSlug];
    if (!config) return { success: false, error: `Unknown contract: ${contractSlug}` };

    const address = getContractAddress(contractSlug);
    const provider = getProvider();
    const contract = config.factory.connect(address, provider);

    const result = await (contract as any)[functionName](...args);
    return { success: true, result: formatResult(result) };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function callWriteFunction(
  contractSlug: string,
  functionName: string,
  args: any[],
  overrideKey?: string
): Promise<
  | { success: true; txHash: string; result: string }
  | { success: false; error: string }
> {
  try {
    const config = contracts[contractSlug];
    if (!config) return { success: false, error: `Unknown contract: ${contractSlug}` };

    const privateKey = overrideKey || getAdminKey(contractSlug);
    if (!privateKey) {
      return {
        success: false,
        error: "No private key available. Provide an override key or configure admin key in .env",
      };
    }

    const address = getContractAddress(contractSlug);
    const signer = getSigner(privateKey);
    const contract = config.factory.connect(address, signer);

    const tx = await (contract as any)[functionName](...args);
    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      result: `Transaction confirmed in block ${receipt.blockNumber}`,
    };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function encodeFunctionData(
  contractSlug: string,
  functionName: string,
  args: any[]
): Promise<{ success: true; data: string } | { success: false; error: string }> {
  try {
    const config = contracts[contractSlug];
    if (!config) return { success: false, error: `Unknown contract: ${contractSlug}` };

    const iface = new Interface(config.factory.abi);
    const encoded = iface.encodeFunctionData(functionName, args);
    return { success: true, data: encoded };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getContractInfo(contractSlug: string): Promise<{
  address: string;
  adminAddress: string | null;
  hasAdminKey: boolean;
}> {
  const config = contracts[contractSlug];
  if (!config) throw new Error(`Unknown contract: ${contractSlug}`);

  return {
    address: process.env[config.addressEnv] || "Not configured",
    adminAddress: config.adminAddressEnv ? process.env[config.adminAddressEnv] || null : null,
    hasAdminKey: config.adminKeyEnv ? !!process.env[config.adminKeyEnv] : false,
  };
}

function formatResult(result: any): string {
  if (typeof result === "bigint") return result.toString();
  if (typeof result === "boolean") return result.toString();
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    if ("toObject" in result && typeof (result as any).toObject === "function") {
      return JSON.stringify((result as any).toObject(), bigintReplacer, 2);
    }
    return JSON.stringify(result, bigintReplacer, 2);
  }
  if (typeof result === "object" && result !== null) {
    return JSON.stringify(result, bigintReplacer, 2);
  }
  return String(result);
}

function bigintReplacer(_key: string, value: any): any {
  return typeof value === "bigint" ? value.toString() : value;
}

function extractErrorMessage(error: any): string {
  if (error.reason) return `Revert: ${error.reason}`;
  if (error.shortMessage) return error.shortMessage;
  if (error.message) {
    return error.message.length > 500 ? error.message.slice(0, 500) + "..." : error.message;
  }
  return "Unknown error";
}
