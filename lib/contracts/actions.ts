"use server";

import { JsonRpcProvider, Wallet, Interface, toUtf8Bytes, hexlify } from "ethers";
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

export async function fetchContractAddress(contractSlug: string): Promise<string> {
  return getContractAddress(contractSlug);
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

export async function initializeMarket(
  ancillaryDataText: string,
  rewardToken: string,
  reward: string,
  proposalBond: string,
  liveness: string,
  privateKey: string
): Promise<
  | { success: true; txHash: string; questionID: string }
  | { success: false; error: string }
> {
  try {
    const config = contracts["uma-ctf-adapter"];
    if (!config) return { success: false, error: "UMA CTF Adapter not configured" };

    const address = getContractAddress("uma-ctf-adapter");
    const signer = getSigner(privateKey);
    const contract = config.factory.connect(address, signer);

    const ancillaryData = hexlify(toUtf8Bytes(ancillaryDataText));
    const tx = await (contract as any).initialize(
      ancillaryData,
      rewardToken,
      BigInt(reward),
      BigInt(proposalBond),
      BigInt(liveness)
    );
    const receipt = await tx.wait();

    // Parse QuestionInitialized event to get questionID
    const iface = new Interface(config.factory.abi);
    let questionID = "";
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({ topics: log.topics, data: log.data });
        if (parsed?.name === "QuestionInitialized") {
          questionID = parsed.args[0]; // questionID is the first indexed arg
          break;
        }
      } catch {
        // skip logs from other contracts
      }
    }

    if (!questionID) {
      return { success: false, error: "Transaction succeeded but could not parse QuestionInitialized event" };
    }

    return { success: true, txHash: receipt.hash, questionID };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function getWalletInfo(privateKey: string): Promise<
  | { success: true; address: string; balance: string }
  | { success: false; error: string }
> {
  try {
    const wallet = getSigner(privateKey);
    const balance = await getProvider().getBalance(wallet.address);
    return { success: true, address: wallet.address, balance: balance.toString() };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

export async function sendNative(
  privateKey: string,
  to: string,
  amountWei: string
): Promise<
  | { success: true; txHash: string }
  | { success: false; error: string }
> {
  try {
    const wallet = getSigner(privateKey);
    const value = BigInt(amountWei);
    const provider = getProvider();

    const balance = await provider.getBalance(wallet.address);
    if (balance < value) {
      const { formatEther } = await import("ethers");
      return {
        success: false,
        error: `Insufficient balance: you have ${formatEther(balance)} POL but trying to send ${formatEther(value)} POL (+ gas fees)`,
      };
    }

    const tx = await wallet.sendTransaction({ to, value });
    const receipt = await tx.wait();
    return { success: true, txHash: receipt!.hash };
  } catch (error: any) {
    return { success: false, error: extractErrorMessage(error) };
  }
}

function extractErrorMessage(error: any): string {
  // shortMessage from ethers is the most descriptive (e.g. "insufficient funds for gas * price + value")
  if (error.shortMessage) {
    // Append revert reason if it adds context beyond generic "require(false)"
    if (error.reason && error.reason !== "require(false)") {
      return `${error.shortMessage} (${error.reason})`;
    }
    return error.shortMessage;
  }
  if (error.reason && error.reason !== "require(false)") return `Revert: ${error.reason}`;
  if (error.code) return `Error [${error.code}]: ${error.message?.slice(0, 300) || "Unknown"}`;
  if (error.message) {
    return error.message.length > 500 ? error.message.slice(0, 500) + "..." : error.message;
  }
  return "Unknown error";
}
