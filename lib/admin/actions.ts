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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
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
