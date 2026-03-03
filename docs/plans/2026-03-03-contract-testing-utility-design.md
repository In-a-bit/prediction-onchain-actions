# Contract Testing Utility — Design

## Purpose

A web utility to test the Polymarket contract infrastructure on Polygon Amoy testnet. Each deployed contract gets a dedicated page where all read/write functions can be invoked with human-readable inputs and outputs.

## Stack

- Next.js 16 App Router, React 19, TypeScript
- ethers.js v6 for blockchain interaction
- TypeChain-generated types from `types/contracts/` for type-safe contract calls
- shadcn/ui + Radix for UI components
- Tailwind CSS v4 for styling

## Architecture

### TypeChain-Driven Rendering

Each contract page uses the TypeChain factory's embedded `abi` property to dynamically render all functions. The factory's `connect()` method creates typed contract instances for actual calls.

```typescript
// Contract registry — one entry per contract page
import { Erc20Abi__factory } from '@/types/contracts/factories/Erc20Abi__factory';
import { CTFExchange__factory } from '@/types/contracts/factories/CTFExchange__factory';
// ...

const contracts = {
  collateral: {
    name: 'ERC20 (Collateral)',
    factory: Erc20Abi__factory,
    addressEnv: 'COLLATERAL_ADDRESS',
    adminKeyEnv: null,
  },
  'ctf-exchange': {
    name: 'CTF Exchange',
    factory: CTFExchange__factory,
    addressEnv: 'CTF_EXCHANGE_ADDRESS',
    adminKeyEnv: 'CTF_EXCHANGE_ADMIN_PRIVATE_KEY',
  },
  // ... all 7 contracts
};
```

### ABI Parsing for UI

Iterate `factory.abi` to extract:
- Function name, inputs (name + type), outputs, stateMutability
- Separate into read (view/pure) and write (nonpayable/payable) sections
- Detect tuple/struct inputs from ABI `components` field for nested form rendering

### Contract Instantiation

```typescript
// Read calls — provider only
const provider = new JsonRpcProvider(process.env.RPC_URL);
const contract = Factory.connect(address, provider);

// Write calls — with signer
const wallet = new Wallet(privateKey, provider);
const contract = Factory.connect(address, wallet);
```

## Page Layout

```
┌─────────────────┬──────────────────────────────────────────────┐
│  Sidebar        │  Contract: ERC20 (Collateral)                │
│                 │  Address: 0x9b4A...0A84                      │
│  ● ERC20        │  Admin: none (use override)                  │
│  ○ CTFExchange  │  Override Key: [___________________]         │
│  ○ Conditional  │                                              │
│  ○ FeeModule    │  ── Read Functions ────────────────────────  │
│  ○ Oracle       │  ▸ name()                    → "TestUSDC"   │
│  ○ OracleWL     │  ▸ symbol()                  → "TUSDC"      │
│  ○ ProxyWF      │  ▸ decimals()                → 6            │
│                 │  ▸ totalSupply()    [readable ✓] → 1,000.00 │
│                 │  ▸ balanceOf(account: address)               │
│                 │  ▸ allowance(owner, spender)                 │
│                 │                                              │
│                 │  ── Write Functions ────────────────────────  │
│                 │  ▸ transfer(to, amount [readable ✓])         │
│                 │  ▸ approve(spender, amount)                  │
│                 │  ▸ allocateTo(ownerAddress, value)           │
│                 │  ...                                         │
└─────────────────┴──────────────────────────────────────────────┘
```

## Contract → Page Mapping

| Contract | Route | Factory | Address Env | Admin Key Env |
|----------|-------|---------|-------------|---------------|
| ERC20 (Collateral) | `/collateral` | `Erc20Abi__factory` | `COLLATERAL_ADDRESS` | none |
| CTF Exchange | `/ctf-exchange` | `CTFExchange__factory` | `CTF_EXCHANGE_ADDRESS` | `CTF_EXCHANGE_ADMIN_PRIVATE_KEY` |
| Conditional Tokens | `/conditional-tokens` | `ConditionalTokens__factory` | (needs env var) | none |
| Fee Module | `/fee-module` | `FeeModule__factory` | `FEE_MODULE_ADDRESS` | `FEE_MODULE_ADMIN_PRIVATE_KEY` |
| Managed Oracle | `/oracle` | `ManagedOptimisticOracleV2Abi__factory` | `MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS` | `MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_PRIVATE_KEY` |
| Oracle Whitelist | `/oracle-whitelist` | `OracleWhitelistAbi__factory` | `ORACLE_WHITELIST_ADDRESS` | `ORACLE_WHITELIST_OWNER_PRIVATE_KEY` |
| Proxy Wallet Factory | `/proxy-wallet-factory` | `ProxyWalletFactoryAbi__factory` | `PROXY_WALLET_FACTORY_ADDRESS` | none |

## Key Features

### Signer Logic (per page)
- Default: uses admin/owner private key from `.env` if available for that contract
- Override: text input at top of page, if filled uses that key instead
- Read functions: always use provider (no signer needed)

### Human-Readable Inputs
- `uint256` fields: toggle between raw (wei) and readable (with decimals, e.g. `100.5` → `100500000`)
- `address` fields: standard text input with hex validation
- `bytes`/`bytes32`: text input with `0x` prefix validation
- Tuple/struct inputs (e.g. `OrderStruct`): expandable fieldset with named inputs per struct field, derived from ABI `components`
- `bool` fields: checkbox or toggle
- Array inputs (`uint256[]`, `address[]`): dynamic add/remove field list

### Human-Readable Outputs
- `uint256` results: show both raw bigint and formatted with decimals when toggle is on
- `bool` results: clear true/false badge
- `address` results: truncated with copy button, link to Polygonscan Amoy
- Struct outputs: formatted as labeled key-value pairs
- Array outputs: rendered as lists

### Transaction Feedback
- Loading spinner while tx is pending
- Success: tx hash linked to Polygonscan Amoy, decoded return values/events
- Error: decoded revert reason, human-readable message

## Shared Components

- `ContractPage` — generic component that takes a contract config and renders all functions
- `FunctionCard` — expandable card for a single function (inputs, execute button, output)
- `InputField` — renders appropriate input for each ABI type (address, uint256, bytes, tuple, etc.)
- `OutputDisplay` — renders return values with formatting
- `ReadableToggle` — switch between raw and human-readable for numeric fields
- `Sidebar` — navigation between contract pages
- `PrivateKeyInput` — override key field with validation

## Implementation Order

1. Shared layout (sidebar + contract page framework + shared components)
2. ERC20 Collateral page (simplest ABI, validates the generic approach)
3. CTF Exchange (complex: OrderStruct inputs, admin functions)
4. Conditional Tokens (ERC1155, bytes32 params)
5. Fee Module (OrderStruct, fee logic)
6. Managed Optimistic Oracle (most complex ABI)
7. Oracle Whitelist (simple)
8. Proxy Wallet Factory (proxy/relay patterns)

Each contract page is done one at a time, validated, then proceed to next.
