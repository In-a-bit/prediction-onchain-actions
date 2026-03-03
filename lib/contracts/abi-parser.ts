import type { ParsedFunction, ParsedParam } from "./types";

interface AbiItem {
  type: string;
  name?: string;
  inputs?: AbiParam[];
  outputs?: AbiParam[];
  stateMutability?: string;
}

interface AbiParam {
  name: string;
  type: string;
  internalType?: string;
  components?: AbiParam[];
  indexed?: boolean;
}

export function parseAbi(abi: readonly any[]): {
  readFunctions: ParsedFunction[];
  writeFunctions: ParsedFunction[];
} {
  const functions: ParsedFunction[] = [];

  for (const item of abi as AbiItem[]) {
    if (item.type !== "function") continue;

    const isRead = item.stateMutability === "view" || item.stateMutability === "pure";

    functions.push({
      name: item.name!,
      inputs: (item.inputs || []).map(parseParam),
      outputs: (item.outputs || []).map(parseParam),
      stateMutability: item.stateMutability as ParsedFunction["stateMutability"],
      isRead,
    });
  }

  const readFunctions = functions.filter((f) => f.isRead).sort((a, b) => a.name.localeCompare(b.name));
  const writeFunctions = functions.filter((f) => !f.isRead).sort((a, b) => a.name.localeCompare(b.name));

  return { readFunctions, writeFunctions };
}

function parseParam(param: AbiParam): ParsedParam {
  return {
    name: param.name || "",
    type: param.type,
    internalType: param.internalType,
    components: param.components?.map(parseParam),
    indexed: param.indexed,
  };
}

export function isNumericType(type: string): boolean {
  return /^u?int\d*$/.test(type);
}

export function isAddressType(type: string): boolean {
  return type === "address";
}

export function isBytesType(type: string): boolean {
  return type === "bytes" || /^bytes\d+$/.test(type);
}

export function isTupleType(type: string): boolean {
  return type === "tuple" || type === "tuple[]";
}

export function isArrayType(type: string): boolean {
  return type.endsWith("[]") && type !== "tuple[]";
}
