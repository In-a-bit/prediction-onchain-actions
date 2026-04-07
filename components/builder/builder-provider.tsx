"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { ParsedMarket } from "@/lib/polymarket/types";
import { PolymarketUserWs } from "@/lib/polymarket/ws-client";
import { getPositions, getTrades } from "@/lib/polymarket/gamma-client";

interface ApiKeyCreds {
  key: string;
  secret: string;
  passphrase: string;
}

export interface OpenOrder {
  id: string;
  status: string;
  market: string;
  asset_id: string;
  side: string;
  original_size: string;
  size_matched: string;
  price: string;
  outcome: string;
  created_at: number;
  order_type: string;
}

interface Trade {
  id: string;
  market: string;
  asset_id: string;
  side: string;
  size: string;
  price: string;
  status: string;
  match_time: string;
  outcome: string;
  transaction_hash: string;
  trader_side: string;
  // data-api field names
  transactionHash?: string;
  timestamp?: number;
  title?: string;
  [key: string]: unknown;
}

interface WalletBalances {
  eoaAddress: string;
  proxyAddress: string;
  eoaPolBalance: string;
  eoaUsdcBalance: string;
  proxyPolBalance: string;
  proxyUsdcBalance: string;
}

interface BuilderState {
  // Wallet
  connected: boolean;
  address: string;
  privateKey: string; // empty when using MetaMask
  isMetaMask: boolean;
  creds: ApiKeyCreds | null;
  balance: string;
  allowance: string;
  polBalance: string;
  walletBalances: WalletBalances | null;

  // Market selection
  selectedMarket: ParsedMarket | null;
  selectedOutcomeIndex: number;

  // Data
  orders: OpenOrder[];
  trades: Trade[];
  positions: Position[];

  // UI state
  connecting: boolean;
  error: string;

  // Sell intent from positions panel → trade panel
  sellIntent: SellIntent | null;
}

export interface SellIntent {
  tokenID: string;
  size: number;
  price: number;
  outcome: string;
  conditionId: string;
  negRisk: boolean;
  title: string;
}

interface Position {
  market: string;
  asset: string;
  side: string;
  size: string;
  avgPrice: string;
  currentPrice: string;
  outcome: string;
  conditionId: string;
  title?: string;
  [key: string]: unknown;
}

interface BuilderContextType extends BuilderState {
  // signerKey: address for MetaMask, privateKey for PK mode — pass to trading-client functions
  signerKey: string;
  connect: (privateKey: string) => Promise<void>;
  connectMM: () => Promise<void>;
  disconnect: () => void;
  selectMarket: (market: ParsedMarket | null) => void;
  setSelectedOutcomeIndex: (index: number) => void;
  refreshBalance: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  refreshPositions: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addLocalOrder: (order: OpenOrder) => void;
  removeLocalOrder: (orderId: string) => void;
  setSellIntent: (intent: SellIntent | null) => void;
}

const BuilderContext = createContext<BuilderContextType | null>(null);

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder must be used within BuilderProvider");
  return ctx;
}

const STORAGE_KEY = "polymarket-builder-session";

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BuilderState>({
    connected: false,
    address: "",
    privateKey: "",
    isMetaMask: false,
    creds: null,
    balance: "0",
    allowance: "0",
    polBalance: "0",
    walletBalances: null,
    selectedMarket: null,
    selectedOutcomeIndex: 0,
    orders: [],
    trades: [],
    positions: [],
    connecting: false,
    error: "",
    sellIntent: null,
  });

  // Restore session from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { privateKey, creds, address, isMetaMask } = JSON.parse(stored);
        if (creds && address) {
          if (isMetaMask) {
            // Re-initialize MetaMask signer for the stored address
            import("@/lib/polymarket/trading-client").then(({ setMetaMaskSigner }) => {
              setMetaMaskSigner(address);
            });
          }
          setState((s) => ({
            ...s,
            connected: true,
            privateKey: isMetaMask ? "" : (privateKey || ""),
            isMetaMask: !!isMetaMask,
            creds,
            address,
          }));
        }
      }
    } catch {
      // sessionStorage may be unavailable or corrupted
    }
  }, []);

  // Save session to sessionStorage when wallet state changes
  useEffect(() => {
    if (state.connected && state.creds) {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          privateKey: state.isMetaMask ? "" : state.privateKey,
          isMetaMask: state.isMetaMask,
          creds: state.creds,
          address: state.address,
        })
      );
    }
  }, [state.connected, state.privateKey, state.isMetaMask, state.creds, state.address]);

  const connect = useCallback(async (privateKey: string) => {
    setState((s) => ({ ...s, connecting: true, error: "" }));
    try {
      const { connectWallet } = await import("@/lib/polymarket/actions");
      const result = await connectWallet(privateKey);
      if (!result.success) {
        setState((s) => ({ ...s, connecting: false, error: result.error || "Connection failed" }));
        return;
      }
      setState((s) => ({
        ...s,
        connected: true,
        address: result.address!,
        privateKey,
        creds: result.creds!,
        connecting: false,
        error: "",
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, []);

  const connectMM = useCallback(async () => {
    if (!window.ethereum) {
      setState((s) => ({ ...s, error: "MetaMask not detected" }));
      return;
    }
    setState((s) => ({ ...s, connecting: true, error: "" }));
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts[0]) {
        setState((s) => ({ ...s, connecting: false, error: "No account selected" }));
        return;
      }
      const address = accounts[0];
      const { connectMetaMask } = await import("@/lib/polymarket/trading-client");
      const result = await connectMetaMask(address);
      if (!result.success) {
        setState((s) => ({ ...s, connecting: false, error: result.error || "MetaMask connection failed" }));
        return;
      }
      setState((s) => ({
        ...s,
        connected: true,
        address,
        privateKey: "",
        isMetaMask: true,
        creds: result.creds!,
        connecting: false,
        error: "",
      }));
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, []);

  const disconnect = useCallback(() => {
    import("@/lib/polymarket/trading-client").then(({ clearMetaMaskSigner }) => {
      clearMetaMaskSigner();
    });
    sessionStorage.removeItem(STORAGE_KEY);
    setState({
      connected: false,
      address: "",
      privateKey: "",
      isMetaMask: false,
      creds: null,
      balance: "0",
      allowance: "0",
      polBalance: "0",
      walletBalances: null,
      selectedMarket: null,
      selectedOutcomeIndex: 0,
      orders: [],
      trades: [],
      positions: [],
      connecting: false,
      error: "",
      sellIntent: null,
    });
  }, []);

  const selectMarket = useCallback((market: ParsedMarket | null) => {
    setState((s) => ({ ...s, selectedMarket: market, selectedOutcomeIndex: 0 }));
  }, []);

  const setSelectedOutcomeIndex = useCallback((index: number) => {
    setState((s) => ({ ...s, selectedOutcomeIndex: index }));
  }, []);

  const addLocalOrder = useCallback((order: OpenOrder) => {
    setState((s) => ({
      ...s,
      orders: [order, ...s.orders.filter((o) => o.id !== order.id)],
    }));
  }, []);

  const removeLocalOrder = useCallback((orderId: string) => {
    setState((s) => ({
      ...s,
      orders: s.orders.filter((o) => o.id !== orderId),
    }));
  }, []);

  const setSellIntent = useCallback((intent: SellIntent | null) => {
    setState((s) => ({ ...s, sellIntent: intent }));
  }, []);

  // In MetaMask mode, use address as the identifier; in PK mode, use privateKey
  const signerKey = state.isMetaMask ? state.address : state.privateKey;

  const refreshBalance = useCallback(async () => {
    if (!state.connected || !state.creds) return;
    try {
      if (state.isMetaMask) {
        const { getBalanceClient, getWalletBalancesClient } = await import("@/lib/polymarket/trading-client");
        const [res, wb] = await Promise.all([
          getBalanceClient(state.address, state.creds),
          getWalletBalancesClient(state.address),
        ]);
        setState((s) => ({
          ...s,
          balance: res.balance,
          allowance: res.allowance,
          polBalance: wb.eoaPolBalance,
          walletBalances: wb,
        }));
      } else {
        const { getBalance, getWalletBalances } = await import("@/lib/polymarket/actions");
        const [res, wb] = await Promise.all([
          getBalance(state.privateKey, state.creds),
          getWalletBalances(state.privateKey),
        ]);
        setState((s) => ({
          ...s,
          balance: res.balance,
          allowance: res.allowance,
          polBalance: wb.eoaPolBalance,
          walletBalances: wb,
        }));
      }
    } catch (e) {
      console.error("[provider] refreshBalance error:", e);
    }
  }, [state.connected, state.creds, state.privateKey, state.isMetaMask, state.address]);

  const refreshOrders = useCallback(async () => {
    if (!state.connected || !state.creds) return;
    try {
      let raw: any[];
      if (state.isMetaMask) {
        const { getOpenOrdersClient } = await import("@/lib/polymarket/trading-client");
        raw = await getOpenOrdersClient(state.address, state.creds);
      } else {
        const { getOpenOrders } = await import("@/lib/polymarket/actions");
        raw = await getOpenOrders(state.privateKey, state.creds);
      }
      console.log("[provider] refreshOrders raw:", raw);
      const apiOrders = (Array.isArray(raw) ? raw : []) as OpenOrder[];
      setState((s) => {
        if (apiOrders.length > 0) {
          return { ...s, orders: apiOrders };
        }
        return s;
      });
    } catch (e) {
      console.error("[provider] refreshOrders error:", e);
    }
  }, [state.connected, state.creds, state.privateKey, state.isMetaMask, state.address]);

  const refreshTrades = useCallback(async () => {
    if (!state.connected || !state.walletBalances) return;
    try {
      const raw = await getTrades(state.walletBalances.proxyAddress);
      console.log("[provider] refreshTrades raw:", raw);
      const trades = (Array.isArray(raw) ? raw : []).map((t: any) => ({
        ...t,
        trader_side: (t.trader_side || "").toUpperCase(),
        side: (t.side || "").toUpperCase(),
      }));
      setState((s) => ({ ...s, trades: trades as Trade[] }));
    } catch (e) {
      console.error("[provider] refreshTrades error:", e);
    }
  }, [state.connected, state.walletBalances]);

  const refreshPositions = useCallback(async () => {
    if (!state.connected || !state.walletBalances) return;
    try {
      const raw = await getPositions(state.walletBalances.proxyAddress);
      console.log("[provider] refreshPositions raw:", raw);
      const positions = Array.isArray(raw) ? raw : [];
      setState((s) => ({ ...s, positions: positions as Position[] }));
    } catch (e) {
      console.error("[provider] refreshPositions error:", e);
    }
  }, [state.connected, state.walletBalances]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshBalance(), refreshOrders(), refreshTrades(), refreshPositions()]);
  }, [refreshBalance, refreshOrders, refreshTrades, refreshPositions]);

  // Auto-refresh on connect — fetch balance first (which populates walletBalances)
  useEffect(() => {
    if (state.connected && state.creds) {
      refreshBalance();
      refreshOrders();
    }
  }, [state.connected, state.creds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once walletBalances is available, fetch trades and positions
  useEffect(() => {
    if (state.connected && state.walletBalances) {
      refreshTrades();
      refreshPositions();
    }
  }, [state.connected, !!state.walletBalances]); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket for real-time order/trade/position updates
  const wsRef = useRef<PolymarketUserWs | null>(null);

  useEffect(() => {
    if (!state.connected || !state.creds) {
      wsRef.current?.disconnect();
      wsRef.current = null;
      return;
    }

    const ws = new PolymarketUserWs(state.creds);
    wsRef.current = ws;

    // Subscribe to the selected market's conditionId if available
    const markets = state.selectedMarket ? [state.selectedMarket.conditionId] : [];
    ws.connect(markets);

    ws.onEvent((event) => {
      console.log("[ws-event]", event.event_type, event.type, event);
      if (event.event_type === "trade") {
        // Optimistically add trade to state immediately
        const wsTrade: Trade = {
          id: (event.id as string) || `ws-${Date.now()}`,
          market: event.market || "",
          asset_id: event.asset_id || "",
          side: (event.side || "").toUpperCase(),
          size: (event.size as string) || "",
          price: event.price || "",
          status: (event.status as string) || "MATCHED",
          match_time: new Date().toISOString(),
          outcome: (event.outcome as string) || "",
          transaction_hash: (event.transaction_hash as string) || "",
          trader_side: ((event.trader_side as string) || "").toUpperCase(),
        };
        setState((s) => ({
          ...s,
          trades: [wsTrade, ...s.trades.filter((t) => t.id !== wsTrade.id)],
        }));
        // Then refresh from API for accurate state
        refreshBalance();
        refreshTrades();
        refreshPositions();
      }
      if (event.event_type === "order") {
        const orderId = event.id as string;
        if (event.type === "CANCELLATION" && orderId) {
          removeLocalOrder(orderId);
        }
        // Also refresh from API to get accurate state
        refreshOrders();
      }
    });

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [state.connected, state.creds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to new markets when selection changes
  useEffect(() => {
    if (state.selectedMarket && wsRef.current) {
      wsRef.current.subscribe([state.selectedMarket.conditionId]);
    }
  }, [state.selectedMarket]);

  // Subscribe WS to all markets from positions and orders for real-time updates
  useEffect(() => {
    if (!wsRef.current) return;
    const marketIds = new Set<string>();
    for (const pos of state.positions) {
      if (pos.conditionId) marketIds.add(pos.conditionId);
    }
    for (const order of state.orders) {
      if (order.market) marketIds.add(order.market);
    }
    if (marketIds.size > 0) {
      wsRef.current.subscribe([...marketIds]);
    }
  }, [state.positions, state.orders]);

  return (
    <BuilderContext.Provider
      value={{
        ...state,
        signerKey: state.isMetaMask ? state.address : state.privateKey,
        connect,
        connectMM,
        disconnect,
        selectMarket,
        setSelectedOutcomeIndex,
        refreshBalance,
        refreshOrders,
        refreshTrades,
        refreshPositions,
        refreshAll,
        addLocalOrder,
        removeLocalOrder,
        setSellIntent,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
}
