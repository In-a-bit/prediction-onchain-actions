"use server";

// --- Gamma API (read operations) ---

export async function searchEvents(
  gammaUrl: string,
  params: Record<string, string>
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    const url = new URL("/events/pagination", gammaUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== "" && value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `${res.status}: ${text}` };
    }
    const data = await res.json();
    return { success: true, data: Array.isArray(data) ? data : data.data ?? [] };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch events" };
  }
}

export async function getEventBySlug(
  gammaUrl: string,
  slug: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${gammaUrl}/events/slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `${res.status}: ${text}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch event" };
  }
}

export async function getMarketBySlug(
  gammaUrl: string,
  slug: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${gammaUrl}/markets/slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `${res.status}: ${text}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to fetch market" };
  }
}

// --- DPM API (write operations) ---

function dpmPostHeaders(extra?: Record<string, string>): Record<string, string> {
  return { "X-API-Key": process.env.DPM_API_KEY ?? "", ...extra };
}

export async function createEvent(
  dpmUrl: string,
  payload: Record<string, any>
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/events`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create event" };
  }
}

export async function createMarket(
  dpmUrl: string,
  payload: Record<string, any>
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create market" };
  }
}

export async function listRelayerWallets(
  dpmUrl: string,
  params: { limit?: string; offset?: string; address?: string; wallet_type?: string; label?: string }
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const url = new URL("/relayer-wallets", dpmUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to list relayer wallets" };
  }
}

export async function createRelayerWallet(
  dpmUrl: string,
  payload: { private_key: string; wallet_type: string; label?: string }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/relayer-wallets`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create relayer wallet" };
  }
}

export async function getSmartAccount(
  dpmUrl: string,
  params: { operator_id: string; address: string; builder_id?: string }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const url = new URL("/smart-account", dpmUrl);
    url.searchParams.set("operator_id", params.operator_id);
    url.searchParams.set("address", params.address);
    if (params.builder_id) url.searchParams.set("builder_id", params.builder_id);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to get smart account" };
  }
}

export async function signalBalanceAdded(
  dpmUrl: string,
  workflowId: string
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets/signal-balance`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ workflow_id: workflowId }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to signal balance added" };
  }
}

// --- UMA Actions ---

export async function umaPropose(
  dpmUrl: string,
  payload: { market_id: string; proposer_address: string; proposed_price: string }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets/uma/propose`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to submit UMA propose" };
  }
}

export async function umaResolve(
  dpmUrl: string,
  payload: { market_id: string }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets/uma/resolve`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to submit UMA resolve" };
  }
}

export async function umaReset(
  dpmUrl: string,
  payload: { market_id: string }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets/uma/reset`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to submit UMA reset" };
  }
}

export async function umaResolveManually(
  dpmUrl: string,
  payload: { market_id: string; payouts: string[] }
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const res = await fetch(`${dpmUrl}/markets/uma/resolve-manually`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to submit UMA resolve manually" };
  }
}

export async function umaPushPrice(
  questionId: string,
  price: string,
): Promise<
  | { success: true; txHash: string }
  | { success: false; error: string }
> {
  try {
    const { contracts } = await import("@/lib/contracts/registry");
    const { Contract, JsonRpcProvider, Wallet, zeroPadValue } = await import("ethers");

    let formattedQuestionId: string;
    try {
      const stripped = questionId.startsWith("0x") ? questionId : `0x${questionId}`;
      formattedQuestionId = zeroPadValue(stripped, 32);
    } catch {
      return { success: false, error: `Invalid question ID format: "${questionId}". Expected a hex bytes32 value.` };
    }

    if (!price || !/^-?\d+$/.test(price.trim())) {
      return { success: false, error: `Invalid price: "${price}". Expected an integer (wei).` };
    }
    const priceInt = BigInt(price.trim());

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return { success: false, error: "RPC_URL not configured" };
    const provider = new JsonRpcProvider(rpcUrl);

    const adapterAddr = process.env.UMA_CTF_ADAPTER_ADDRESS;
    if (!adapterAddr) return { success: false, error: "UMA_CTF_ADAPTER_ADDRESS not configured" };
    const adapterConfig = contracts["uma-ctf-adapter"];
    if (!adapterConfig) return { success: false, error: "UMA CTF Adapter not in registry" };
    const adapter = adapterConfig.factory.connect(adapterAddr, provider);

    const questionData = await (adapter as any).questions(formattedQuestionId);
    const requestTimestamp: bigint = questionData.requestTimestamp;
    const ancillaryData: string = questionData.ancillaryData;
    if (!ancillaryData || ancillaryData === "0x") {
      return { success: false, error: "Question not initialized on adapter (empty ancillary data)" };
    }

    const ooAddr = process.env.MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS;
    if (!ooAddr) return { success: false, error: "MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS not configured" };
    const ooConfig = contracts["oracle"];
    if (!ooConfig) return { success: false, error: "Oracle not in registry" };
    const oo = ooConfig.factory.connect(ooAddr, provider);

    const YES_OR_NO_IDENTIFIER = "0x5945535f4f525f4e4f5f51554552590000000000000000000000000000000000";

    const ooRequest = await (oo as any).getRequest(
      adapterAddr,
      YES_OR_NO_IDENTIFIER,
      requestTimestamp,
      ancillaryData,
    );
    const expirationTime: bigint = ooRequest.expirationTime;
    if (expirationTime === BigInt(0)) {
      return {
        success: false,
        error: "No price has been proposed yet for this question — nothing to dispute or push.",
      };
    }
    const isEventBased: boolean = ooRequest.requestSettings.eventBased;
    const customLiveness: bigint = ooRequest.requestSettings.customLiveness;
    const defaultLiveness: bigint = await (oo as any).defaultLiveness();
    const effectiveLiveness = customLiveness !== BigInt(0) ? customLiveness : defaultLiveness;
    const dvmTime = isEventBased ? expirationTime - effectiveLiveness : requestTimestamp;

    const stampedAncillary: string = await (oo as any).stampAncillaryData(ancillaryData, adapterAddr);

    const DEFAULT_MOCK_ORACLE_ADDRESS = "0x2271a5E74eA8A29764ab10523575b41AA52455f0";
    const mockOracleAddr = process.env.MOCK_ORACLE_ADDRESS || DEFAULT_MOCK_ORACLE_ADDRESS;

    const privateKey = process.env.MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_PRIVATE_KEY;
    if (!privateKey) return { success: false, error: "Signer key not configured" };
    const signer = new Wallet(privateKey, provider);

    const mockOracleAbi = [
      "function pushPrice(bytes32 identifier, uint256 time, bytes ancillaryData, int256 price)",
    ];
    const mockOracle = new Contract(mockOracleAddr, mockOracleAbi, signer);

    const tx = await mockOracle.pushPrice(
      YES_OR_NO_IDENTIFIER,
      dvmTime,
      stampedAncillary,
      priceInt,
    );
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? (error.reason && error.reason !== "require(false)"
          ? `${error.shortMessage} (${error.reason})`
          : error.shortMessage)
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function umaDispute(
  questionId: string,
  disputerAddress?: string,
): Promise<
  | { success: true; txHash: string }
  | { success: false; error: string }
> {
  try {
    const { contracts } = await import("@/lib/contracts/registry");
    const { JsonRpcProvider, Wallet, zeroPadValue, isAddress } = await import("ethers");

    let formattedQuestionId: string;
    try {
      const stripped = questionId.startsWith("0x") ? questionId : `0x${questionId}`;
      formattedQuestionId = zeroPadValue(stripped, 32);
    } catch {
      return { success: false, error: `Invalid question ID format: "${questionId}". Expected a hex bytes32 value.` };
    }

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return { success: false, error: "RPC_URL not configured" };
    const provider = new JsonRpcProvider(rpcUrl);

    const adapterAddr = process.env.UMA_CTF_ADAPTER_ADDRESS;
    if (!adapterAddr) return { success: false, error: "UMA_CTF_ADAPTER_ADDRESS not configured" };

    const adapterConfig = contracts["uma-ctf-adapter"];
    if (!adapterConfig) return { success: false, error: "UMA CTF Adapter not in registry" };
    const adapter = adapterConfig.factory.connect(adapterAddr, provider);

    const questionData = await (adapter as any).questions(formattedQuestionId);
    const requestTimestamp = questionData.requestTimestamp;
    const ancillaryData = questionData.ancillaryData;
    if (!ancillaryData || ancillaryData === "0x") {
      return { success: false, error: "Question not initialized on adapter (empty ancillary data)" };
    }

    const oracleAddr = process.env.MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS;
    if (!oracleAddr) return { success: false, error: "Oracle address not configured" };
    const privateKey = process.env.MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_PRIVATE_KEY;
    if (!privateKey) return { success: false, error: "Oracle admin key not configured" };

    const signer = new Wallet(privateKey, provider);
    const oracleConfig = contracts["oracle"];
    if (!oracleConfig) return { success: false, error: "Oracle not in registry" };
    const oracle = oracleConfig.factory.connect(oracleAddr, signer);

    const YES_OR_NO_IDENTIFIER = "0x5945535f4f525f4e4f5f51554552590000000000000000000000000000000000";

    let disputerAddr: string;
    if (disputerAddress && disputerAddress.trim() !== "") {
      if (!isAddress(disputerAddress.trim())) {
        return { success: false, error: `Invalid disputer address: "${disputerAddress}"` };
      }
      disputerAddr = disputerAddress.trim();
    } else {
      disputerAddr = await signer.getAddress();
    }

    const tx = await (oracle as any).disputePriceFor(
      disputerAddr,
      adapterAddr,
      YES_OR_NO_IDENTIFIER,
      requestTimestamp,
      ancillaryData,
    );
    const receipt = await tx.wait();

    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? (error.reason && error.reason !== "require(false)"
          ? `${error.shortMessage} (${error.reason})`
          : error.shortMessage)
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

// --- Contracts ---

export async function listContracts(
  dpmUrl: string
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/contracts`, { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data: Array.isArray(data) ? data : data?.data ?? [] };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to list contracts" };
  }
}

export async function createContract(
  dpmUrl: string,
  payload: { address: string; name: string; contract_type: string }
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/contracts`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to create contract" };
  }
}

export async function getCollateralBalance(
  dpmUrl: string,
  address: string
): Promise<
  | { success: true; data: any }
  | { success: false; error: string }
> {
  try {
    const url = new URL("/collateral/balance", dpmUrl);
    url.searchParams.set("address", address);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to get collateral balance" };
  }
}

// --- Users (admin listing) ---

export async function listUsers(
  dpmUrl: string,
  params: {
    limit?: string;
    offset?: string;
    search?: string;
    address?: string;
    proxy_wallet?: string;
    has_proxy?: string;
  }
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const url = new URL("/users", dpmUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, value);
      }
    }
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to list users" };
  }
}

// --- Balance sync (admin refresh) ---

export async function backfillCollateral(
  dpmUrl: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/collateral/backfill`, {
      method: "POST",
      headers: dpmPostHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to backfill collateral balances" };
  }
}

export async function syncCollateralUser(
  dpmUrl: string,
  userId: number
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/collateral/sync/${userId}`, {
      method: "POST",
      headers: dpmPostHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to sync user balance" };
  }
}

export async function getUserTokenBalances(
  dpmUrl: string,
  userId: number
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/users/${userId}/token-balances`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to get token balances" };
  }
}

export async function syncUserTokenBalance(
  dpmUrl: string,
  userId: number,
  tokenId: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/users/${userId}/token-balance`, {
      method: "POST",
      headers: dpmPostHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ token_id: tokenId }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to sync token balance" };
  }
}

export async function syncUserTokenBalancesFromOrders(
  dpmUrl: string,
  userId: number
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const res = await fetch(`${dpmUrl}/users/${userId}/token-balances`, {
      method: "POST",
      headers: dpmPostHeaders(),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to sync token balances from orders" };
  }
}

// --- Treasury ---

export async function treasuryGetBalances(
  addresses: string[],
  tokenAddress: string,
): Promise<{ success: true; data: { address: string; token: string; balance: string; balanceFormatted: string }[] } | { success: false; error: string }> {
  try {
    const { contracts } = await import("@/lib/contracts/registry");
    const { JsonRpcProvider, isAddress } = await import("ethers");

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return { success: false, error: "RPC_URL not configured" };

    const treasuryAddr = process.env.TREASURY_ADDRESS;
    if (!treasuryAddr) return { success: false, error: "TREASURY_ADDRESS not configured" };

    const cfg = contracts["treasury"];
    if (!cfg) return { success: false, error: "Treasury not in registry" };

    const provider = new JsonRpcProvider(rpcUrl);
    const treasury = cfg.factory.connect(treasuryAddr, provider);

    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const isNative = tokenAddress === ZERO_ADDR || tokenAddress === "";

    const invalid = addresses.filter((a) => !isAddress(a));
    if (invalid.length > 0) {
      return { success: false, error: `Invalid address(es): ${invalid.join(", ")}` };
    }

    const queries = addresses.map((addr) => ({
      targetAddress: addr,
      tokenAddress: isNative ? ZERO_ADDR : tokenAddress,
      spenderAddress: ZERO_ADDR,
    }));

    const results: any[] = await (treasury as any).getBalancesAndAllowances(queries);

    const decimals = isNative ? 18 : 6;
    const base = BigInt(10) ** BigInt(decimals);

    const data = results.map((r: any) => {
      const bal = BigInt(r.balance.toString());
      const whole = bal / base;
      const frac = (bal % base).toString().padStart(decimals, "0").slice(0, 4);
      return {
        address: r.balanceQuery.targetAddress,
        token: isNative ? "native (POL)" : tokenAddress,
        balance: r.balance.toString(),
        balanceFormatted: `${whole.toLocaleString()}.${frac}`,
      };
    });

    return { success: true, data };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryHasRole(
  role: "admin" | "operator",
  address: string,
): Promise<{ success: true; data: { hasRole: boolean; role: string; address: string } } | { success: false; error: string }> {
  try {
    const { contracts } = await import("@/lib/contracts/registry");
    const { JsonRpcProvider, keccak256, toUtf8Bytes } = await import("ethers");

    const rpcUrl = process.env.RPC_URL;
    if (!rpcUrl) return { success: false, error: "RPC_URL not configured" };

    const treasuryAddr = process.env.TREASURY_ADDRESS;
    if (!treasuryAddr) return { success: false, error: "TREASURY_ADDRESS not configured" };

    const cfg = contracts["treasury"];
    if (!cfg) return { success: false, error: "Treasury not in registry" };

    const provider = new JsonRpcProvider(rpcUrl);
    const treasury = cfg.factory.connect(treasuryAddr, provider);

    const roleBytes =
      role === "admin"
        ? "0x0000000000000000000000000000000000000000000000000000000000000000"
        : keccak256(toUtf8Bytes("OPERATOR_ROLE"));

    const result: boolean = await (treasury as any).hasRole(roleBytes, address);
    return { success: true, data: { hasRole: result, role, address } };
  } catch (error: any) {
    const msg = error.shortMessage ?? error.message ?? "Unknown error";
    return { success: false, error: msg };
  }
}

async function buildTreasurySigner() {
  const { contracts } = await import("@/lib/contracts/registry");
  const { JsonRpcProvider, Wallet } = await import("ethers");

  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) throw new Error("RPC_URL not configured");

  const treasuryAddr = process.env.TREASURY_ADDRESS;
  if (!treasuryAddr) throw new Error("TREASURY_ADDRESS not configured");

  const privateKey = process.env.TREASURY_ADMIN_PRIVATE_KEY;
  if (!privateKey) throw new Error("TREASURY_ADMIN_PRIVATE_KEY not configured");

  const cfg = contracts["treasury"];
  if (!cfg) throw new Error("Treasury not in registry");

  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const treasury = cfg.factory.connect(treasuryAddr, signer);

  return { treasury, treasuryAddr };
}

export async function treasuryGrantOperatorRole(
  addresses: string[],
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).grantOperatorRole(addresses);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryRevokeOperatorRole(
  addresses: string[],
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).revokeOperatorRole(addresses);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryGrantAdminRole(
  addresses: string[],
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).grantAdminRole(addresses);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryRevokeAdminRole(
  addresses: string[],
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).revokeAdminRole(addresses);
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryWithdrawETH(): Promise<
  { success: true; txHash: string } | { success: false; error: string }
> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).withdrawETH();
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

export async function treasuryWithdrawToken(
  tokenAddress: string,
  amount: string,
): Promise<{ success: true; txHash: string } | { success: false; error: string }> {
  try {
    const { treasury } = await buildTreasurySigner();
    const tx = await (treasury as any).withdrawToken(tokenAddress, BigInt(amount));
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    const msg = error.shortMessage
      ? error.reason && error.reason !== "require(false)"
        ? `${error.shortMessage} (${error.reason})`
        : error.shortMessage
      : error.message || "Unknown error";
    return { success: false, error: msg };
  }
}

// --- Conditional tokens ---

export async function getConditionalTokenBalance(
  dpmUrl: string,
  address: string,
  tokenId: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const url = new URL("/conditional-tokens/balance", dpmUrl);
    url.searchParams.set("address", address);
    url.searchParams.set("token_id", tokenId);
    const res = await fetch(url.toString(), { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errMsg =
        data?.error || data?.message || JSON.stringify(data) || `Status ${res.status}`;
      return { success: false, error: errMsg };
    }
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || "Failed to get conditional token balance" };
  }
}
