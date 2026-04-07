export interface GammaEvent {
  id: string;
  title: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  image: string;
  icon: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  new: boolean;
  featured: boolean;
  restricted: boolean;
  liquidity: number;
  volume: number;
  openInterest: number;
  createdAt: string;
  updatedAt: string;
  competitive: number;
  volume24hr: number;
  enableOrderBook: boolean;
  markets: GammaMarket[];
  tags?: GammaTag[];
  cyom?: boolean;
  showAllOutcomes?: boolean;
  showMarketImages?: boolean;
  commentCount: number;
}

export interface GammaTag {
  id: string;
  label: string;
  slug: string;
}

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  resolutionSource: string;
  endDate: string;
  liquidity: string;
  startDate: string;
  image: string;
  icon: string;
  description: string;
  outcomes: string;
  outcomePrices: string;
  volume: string;
  active: boolean;
  closed: boolean;
  marketMakerAddress: string;
  createdAt: string;
  updatedAt: string;
  new: boolean;
  featured: boolean;
  submitted_by: string;
  archived: boolean;
  resolvedBy: string;
  restricted: boolean;
  groupItemTitle: string;
  groupItemThreshold: string;
  questionID: string;
  enableOrderBook: boolean;
  orderPriceMinTickSize: number;
  orderMinSize: number;
  volumeNum: number;
  liquidityNum: number;
  endDateIso: string;
  startDateIso: string;
  hasReviewedDates: boolean;
  volume24hr: number;
  clobTokenIds: string;
  umaBond: string;
  umaReward: string;
  volume24hrClob: number;
  volumeClob: number;
  liquidityClob: number;
  acceptingOrders: boolean;
  negRisk: boolean;
  acceptingOrderTimestamp: string;
  competitive: number;
  pagerDutyNotificationEnabled: boolean;
  spread: number;
  oneDayPriceChange: number;
  lastTradePrice: number;
  bestBid: number;
  bestAsk: number;
  automaticallyActive: boolean;
  clearBookOnStart: boolean;
  seriesColor: string;
  showQuickBuyPrices: boolean;
  ready: boolean;
  funded: boolean;
  cyom: boolean;
  commentCount: number;
  rewardsMinSize: number;
  rewardsMaxSpread: number;
  rewardsActive: boolean;
  secondsDelay: number;
  notificationsEnabled: boolean;
}

// Wallet connection state
export interface WalletState {
  connected: boolean;
  address: string;
  privateKey: string;
  creds: { key: string; secret: string; passphrase: string } | null;
  usdcBalance: string;
}

// Parsed market helpers
export interface ParsedMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomes: string[];
  outcomePrices: number[];
  clobTokenIds: string[];
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  negRisk: boolean;
  tickSize: string;
  endDate: string;
  image: string;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  spread: number;
  oneDayPriceChange: number;
}

export function parseMarket(m: GammaMarket): ParsedMarket {
  let outcomes: string[] = [];
  let outcomePrices: number[] = [];
  let clobTokenIds: string[] = [];
  try { outcomes = JSON.parse(m.outcomes || "[]"); } catch { outcomes = ["Yes", "No"]; }
  try { outcomePrices = JSON.parse(m.outcomePrices || "[]").map(Number); } catch { outcomePrices = [0, 0]; }
  try { clobTokenIds = JSON.parse(m.clobTokenIds || "[]"); } catch { clobTokenIds = []; }

  const tickMap: Record<number, string> = { 0.1: "0.1", 0.01: "0.01", 0.001: "0.001", 0.0001: "0.0001" };

  return {
    id: m.id,
    question: m.question,
    conditionId: m.conditionId,
    slug: m.slug,
    outcomes,
    outcomePrices,
    clobTokenIds,
    volume: m.volumeNum || 0,
    liquidity: m.liquidityNum || 0,
    active: m.active,
    closed: m.closed,
    negRisk: m.negRisk,
    tickSize: tickMap[m.orderPriceMinTickSize] || "0.01",
    endDate: m.endDateIso || m.endDate,
    image: m.image || m.icon,
    bestBid: m.bestBid || 0,
    bestAsk: m.bestAsk || 0,
    lastTradePrice: m.lastTradePrice || 0,
    spread: m.spread || 0,
    oneDayPriceChange: m.oneDayPriceChange || 0,
  };
}
