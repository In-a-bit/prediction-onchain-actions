// ABI fragments for decoding FeeModule.matchOrders transactions and related events.
// Two versions exist: the deployed (v1, 5 params) and the updated source (v2, 7 params).

const OrderTupleComponents = [
  { name: "salt", type: "uint256" },
  { name: "maker", type: "address" },
  { name: "signer", type: "address" },
  { name: "taker", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "makerAmount", type: "uint256" },
  { name: "takerAmount", type: "uint256" },
  { name: "expiration", type: "uint256" },
  { name: "nonce", type: "uint256" },
  { name: "feeRateBps", type: "uint256" },
  { name: "side", type: "uint8" },
  { name: "signatureType", type: "uint8" },
  { name: "signature", type: "bytes" },
] as const;

// V1: deployed on testnet (5 params)
export const feeModuleMatchOrdersV1 = {
  name: "matchOrders",
  type: "function",
  inputs: [
    { name: "takerOrder", type: "tuple", components: OrderTupleComponents },
    { name: "makerOrders", type: "tuple[]", components: OrderTupleComponents },
    { name: "takerFillAmount", type: "uint256" },
    { name: "makerFillAmounts", type: "uint256[]" },
    { name: "makerFeeRate", type: "uint256" },
  ],
} as const;

// V2: updated source (7 params)
export const feeModuleMatchOrdersV2 = {
  name: "matchOrders",
  type: "function",
  inputs: [
    { name: "takerOrder", type: "tuple", components: OrderTupleComponents },
    { name: "makerOrders", type: "tuple[]", components: OrderTupleComponents },
    { name: "takerFillAmount", type: "uint256" },
    { name: "takerReceiveAmount", type: "uint256" },
    { name: "makerFillAmounts", type: "uint256[]" },
    { name: "takerFeeAmount", type: "uint256" },
    { name: "makerFeeAmounts", type: "uint256[]" },
  ],
} as const;

// Events from CTFExchange
export const orderFilledEvent = {
  name: "OrderFilled",
  type: "event",
  anonymous: false,
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "maker", type: "address", indexed: true },
    { name: "taker", type: "address", indexed: true },
    { name: "makerAssetId", type: "uint256", indexed: false },
    { name: "takerAssetId", type: "uint256", indexed: false },
    { name: "makerAmountFilled", type: "uint256", indexed: false },
    { name: "takerAmountFilled", type: "uint256", indexed: false },
    { name: "fee", type: "uint256", indexed: false },
  ],
} as const;

export const ordersMatchedEvent = {
  name: "OrdersMatched",
  type: "event",
  anonymous: false,
  inputs: [
    { name: "takerOrderHash", type: "bytes32", indexed: true },
    { name: "takerOrderMaker", type: "address", indexed: true },
    { name: "makerAssetId", type: "uint256", indexed: false },
    { name: "takerAssetId", type: "uint256", indexed: false },
    { name: "makerAmountFilled", type: "uint256", indexed: false },
    { name: "takerAmountFilled", type: "uint256", indexed: false },
  ],
} as const;

export const feeChargedEvent = {
  name: "FeeCharged",
  type: "event",
  anonymous: false,
  inputs: [
    { name: "receiver", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: false },
    { name: "amount", type: "uint256", indexed: false },
  ],
} as const;

// Events from FeeModule
export const feeRefundedEvent = {
  name: "FeeRefunded",
  type: "event",
  anonymous: false,
  inputs: [
    { name: "orderHash", type: "bytes32", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "id", type: "uint256", indexed: false },
    { name: "refund", type: "uint256", indexed: false },
    { name: "feeCharged", type: "uint256", indexed: true },
  ],
} as const;

// Combined ABI for Interface creation
export const combinedAbi = [
  feeModuleMatchOrdersV1,
  feeModuleMatchOrdersV2,
  orderFilledEvent,
  ordersMatchedEvent,
  feeChargedEvent,
  feeRefundedEvent,
];
