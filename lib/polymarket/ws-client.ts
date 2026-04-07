// Polymarket CLOB WebSocket client for real-time user events (orders, trades)

type WsEvent = {
  event_type: "trade" | "order";
  type: string; // PLACEMENT, UPDATE, CANCELLATION, TRADE
  market: string;
  asset_id: string;
  side: string;
  price: string;
  [key: string]: unknown;
};

type WsListener = (event: WsEvent) => void;

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user";
const PING_INTERVAL = 10_000;

export class PolymarketUserWs {
  private ws: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<WsListener>();
  private auth: { apiKey: string; secret: string; passphrase: string };
  private markets: string[] = [];
  private closed = false;

  constructor(creds: { key: string; secret: string; passphrase: string }) {
    this.auth = {
      apiKey: creds.key,
      secret: creds.secret,
      passphrase: creds.passphrase,
    };
  }

  connect(markets: string[] = []) {
    this.closed = false;
    this.markets = markets;
    this._connect();
  }

  private _connect() {
    if (this.closed) return;
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log("[ws] Connected to Polymarket user channel");
      const msg = {
        auth: this.auth,
        markets: this.markets,
        assets_ids: [],
        type: "user",
      };
      console.log("[ws] Auth message — markets:", this.markets.length, "apiKey:", this.auth.apiKey?.slice(0, 8) + "...");
      this.ws!.send(JSON.stringify(msg));

      // Start heartbeat
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send("PING");
        }
      }, PING_INTERVAL);
    };

    this.ws.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : "";
      if (data === "PONG") return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.event_type) {
          console.log(`[ws] ${parsed.event_type}/${parsed.type}:`, parsed.market?.slice(0, 10));
          this.listeners.forEach((fn) => fn(parsed as WsEvent));
        } else {
          // Log non-event messages (errors, acks, etc.)
          console.log("[ws] message:", data.slice(0, 200));
        }
      } catch {
        console.log("[ws] non-JSON:", data.slice(0, 100));
      }
    };

    this.ws.onclose = () => {
      console.log("[ws] Disconnected");
      this._cleanup();
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private _cleanup() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private _scheduleReconnect() {
    if (this.closed) return;
    this.reconnectTimer = setTimeout(() => this._connect(), 3000);
  }

  subscribe(conditionIds: string[]) {
    const newIds = conditionIds.filter((id) => !this.markets.includes(id));
    if (newIds.length === 0) return;
    this.markets.push(...newIds);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "user", markets: newIds, operation: "subscribe" }));
      console.log("[ws] Subscribed to markets:", newIds);
    }
  }

  onEvent(listener: WsListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect() {
    this.closed = true;
    this._cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
  }
}
