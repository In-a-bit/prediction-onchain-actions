import { Erc20Abi__factory } from "@/types/contracts/factories/Erc20Abi__factory";
import { CTFExchange__factory } from "@/types/contracts/factories/CTFExchange__factory";
import { ConditionalTokens__factory } from "@/types/contracts/factories/ConditionalTokens__factory";
import { FeeModule__factory } from "@/types/contracts/factories/FeeModule__factory";
import { ManagedOptimisticOracleV2Abi__factory } from "@/types/contracts/factories/ManagedOptimisticOracleV2Abi__factory";
import { OracleWhitelistAbi__factory } from "@/types/contracts/factories/OracleWhitelistAbi__factory";
import { ProxyWalletFactoryAbi__factory } from "@/types/contracts/factories/ProxyWalletFactoryAbi__factory";
import type { ContractConfig } from "./types";

export const contracts: Record<string, ContractConfig> = {
  collateral: {
    name: "ERC20 (Collateral)",
    slug: "collateral",
    factory: Erc20Abi__factory,
    addressEnv: "COLLATERAL_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "ERC20 collateral token used for trading",
  },
  "ctf-exchange": {
    name: "CTF Exchange",
    slug: "ctf-exchange",
    factory: CTFExchange__factory,
    addressEnv: "CTF_EXCHANGE_ADDRESS",
    adminKeyEnv: "CTF_EXCHANGE_ADMIN_PRIVATE_KEY",
    adminAddressEnv: "CTF_EXCHANGE_ADMIN_ADDRESS",
    description: "Conditional Token Framework exchange for order matching",
  },
  "conditional-tokens": {
    name: "Conditional Tokens",
    slug: "conditional-tokens",
    factory: ConditionalTokens__factory,
    addressEnv: "CONDITIONAL_TOKENS_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "ERC1155 conditional tokens for prediction market positions",
  },
  "fee-module": {
    name: "Fee Module",
    slug: "fee-module",
    factory: FeeModule__factory,
    addressEnv: "FEE_MODULE_ADDRESS",
    adminKeyEnv: "FEE_MODULE_ADMIN_PRIVATE_KEY",
    adminAddressEnv: "FEE_MODULE_ADMIN_ADDRESS",
    description: "Trading fee collection and management",
  },
  oracle: {
    name: "Managed Optimistic Oracle",
    slug: "oracle",
    factory: ManagedOptimisticOracleV2Abi__factory,
    addressEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_ADDRESS",
    adminKeyEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_PRIVATE_KEY",
    adminAddressEnv: "MANAGED_OPTIMISTIC_ORACLE_PROXY_OWNER_ADDRESS",
    description: "UMA optimistic oracle for outcome resolution",
  },
  "oracle-whitelist": {
    name: "Oracle Whitelist",
    slug: "oracle-whitelist",
    factory: OracleWhitelistAbi__factory,
    addressEnv: "ORACLE_WHITELIST_ADDRESS",
    adminKeyEnv: "ORACLE_WHITELIST_OWNER_PRIVATE_KEY",
    adminAddressEnv: "ORACLE_WHITELIST_OWNER_ADDRESS",
    description: "Access control for oracle operations",
  },
  "proxy-wallet-factory": {
    name: "Proxy Wallet Factory",
    slug: "proxy-wallet-factory",
    factory: ProxyWalletFactoryAbi__factory,
    addressEnv: "PROXY_WALLET_FACTORY_ADDRESS",
    adminKeyEnv: null,
    adminAddressEnv: null,
    description: "Factory for creating proxy wallets",
  },
};

export const contractSlugs = Object.keys(contracts);
