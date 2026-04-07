export const CLOB_API_HOST = "https://clob.polymarket.com";
export const GAMMA_API_HOST = "https://gamma-api.polymarket.com";
export const DATA_API_HOST = "https://data-api.polymarket.com";
export const CHAIN_ID = 137;
export const POLYGON_RPC = "https://polygon-rpc.com";

// Polygon Mainnet contract addresses (from @polymarket/clob-client config)
export const CONTRACTS = {
  exchange: "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E",
  negRiskExchange: "0xC5d563A36AE78145C45a50134d48A1215220f80a",
  negRiskAdapter: "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296",
  collateral: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
  conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  proxyFactory: "0xaB45c5A4B0c941a2F231C04C3f49182e1A254052",
} as const;
