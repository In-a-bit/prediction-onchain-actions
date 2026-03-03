export interface ContractConfig {
  name: string;
  slug: string;
  factory: { abi: readonly any[]; connect: (address: string, runner?: any) => any };
  addressEnv: string;
  adminKeyEnv: string | null;
  adminAddressEnv: string | null;
  description: string;
}

export interface ParsedFunction {
  name: string;
  inputs: ParsedParam[];
  outputs: ParsedParam[];
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  isRead: boolean;
}

export interface ParsedParam {
  name: string;
  type: string;
  internalType?: string;
  components?: ParsedParam[];
  indexed?: boolean;
}

export type FunctionResult =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: string; txHash?: string }
  | { status: "error"; error: string };
