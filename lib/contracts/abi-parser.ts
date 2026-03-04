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

/** Single tuple/struct — NOT tuple[] */
export function isTupleType(type: string): boolean {
  return type === "tuple";
}

/** Array of tuples/structs */
export function isTupleArrayType(type: string): boolean {
  return type === "tuple[]";
}

/** Simple array (not tuple[]) */
export function isArrayType(type: string): boolean {
  return type.endsWith("[]") && type !== "tuple[]";
}

/**
 * Recursively convert a parsed input value to the format ethers expects.
 * - tuple: JSON object → ordered array of component values (recursive)
 * - tuple[]: JSON array of objects → array of ordered arrays
 * - primitive[]: JSON array of strings → array of strings
 * - primitive: string → string
 */
export function convertInputToArg(value: string, param: ParsedParam): any {
  if (param.type === "tuple" && param.components) {
    return convertTupleValue(value, param.components);
  }

  if (param.type === "tuple[]" && param.components) {
    try {
      const arr = JSON.parse(value || "[]");
      return arr.map((item: any) => {
        const objStr = typeof item === "string" ? item : JSON.stringify(item);
        return convertTupleValue(objStr, param.components!);
      });
    } catch {
      return [];
    }
  }

  if (param.type.endsWith("[]")) {
    try {
      return JSON.parse(value || "[]");
    } catch {
      return [];
    }
  }

  return value;
}

function convertTupleValue(value: string, components: ParsedParam[]): any[] {
  try {
    const obj = typeof value === "object" ? value : JSON.parse(value || "{}");
    return components.map((c) => {
      const fieldVal = obj[c.name] ?? "";
      // Recurse for nested tuples
      if (c.type === "tuple" && c.components) {
        const nested = typeof fieldVal === "string" ? fieldVal : JSON.stringify(fieldVal);
        return convertTupleValue(nested, c.components);
      }
      if (c.type === "tuple[]" && c.components) {
        const arr = typeof fieldVal === "string" ? JSON.parse(fieldVal || "[]") : fieldVal;
        return arr.map((item: any) => {
          const s = typeof item === "string" ? item : JSON.stringify(item);
          return convertTupleValue(s, c.components!);
        });
      }
      if (c.type.endsWith("[]")) {
        return typeof fieldVal === "string" ? JSON.parse(fieldVal || "[]") : fieldVal;
      }
      return typeof fieldVal === "string" ? fieldVal : String(fieldVal);
    });
  } catch {
    return [];
  }
}
