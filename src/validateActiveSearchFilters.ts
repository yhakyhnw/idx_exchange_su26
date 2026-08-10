import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PropertyFilters } from "./types.ts";

type ValidRetsPropertyArgs = {
  L_City: string[];
  L_systemPrice: { min: number | null; max: number | null };
  L_Keyword2: { min: number | null; max: number | null };
  LM_Dec_3: { min: number | null; max: number | null };
  LM_Int2_3: { min: number | null; max: number | null };
  L_Type_: string[];
  PoolPrivateYN: string[];
  ViewYN: string[];
  AssociationFee: { min: number | null; max: number | null };
};

type ValidationResult =
  | { ok: true }
  | {
      ok: false;
      field: string;
      message: string;
    };

function formatNumberRange(min: number | null, max: number | null): string {
  const minText = min !== null ? min.toLocaleString() : "N/A";
  const maxText = max !== null ? max.toLocaleString() : "N/A";
  return `[${minText}, ${maxText}]`;
}

function formatCurrencyRange(min: number | null, max: number | null): string {
  const minText = min !== null ? `$${min.toLocaleString()}` : "N/A";
  const maxText = max !== null ? `$${max.toLocaleString()}` : "N/A";
  return `[${minText}, ${maxText}]`;
}

function isOutOfRange(value: number, bounds: { min: number | null; max: number | null }): boolean {
  if (bounds.min !== null && value < bounds.min) return true;
  if (bounds.max !== null && value > bounds.max) return true;
  return false;
}

function listHasValue(values: string[], target: string): boolean {
  return values.some((value) => value.toLowerCase() === target.toLowerCase());
}

async function loadValidRetsPropertyArgs(): Promise<ValidRetsPropertyArgs> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const jsonPath = path.join(currentDir, "valid_q_args", "valid_rets_property_args.json");
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw) as ValidRetsPropertyArgs;
}

export async function validateSearchFilters(filters: PropertyFilters): Promise<ValidationResult> {
  const validArgs = await loadValidRetsPropertyArgs();

  if (filters.city && !listHasValue(validArgs.L_City, filters.city)) {
    return {
      ok: false,
      field: "city",
      message:
        "That city is not present in the current database, would you like to try a different city?",
    };
  }
  if (filters.maxPrice !== null && isOutOfRange(filters.maxPrice, validArgs.L_systemPrice)) {
    return {
      ok: false,
      field: "maxPrice",
      message:
        `That max price is outside the current database range ` +
        `${formatCurrencyRange(validArgs.L_systemPrice.min, validArgs.L_systemPrice.max)}.`,
    };
  }
  if (filters.beds !== null && isOutOfRange(filters.beds, validArgs.L_Keyword2)) {
    return {
      ok: false,
      field: "beds",
      message:
        `That bedroom count is outside the current database range ` +
        `${formatNumberRange(validArgs.L_Keyword2.min, validArgs.L_Keyword2.max)}.`,
    };
  }
  if (filters.baths !== null && isOutOfRange(filters.baths, validArgs.LM_Dec_3)) {
    return {
      ok: false,
      field: "baths",
      message:
        `That bathroom count is outside the current database range ` +
        `${formatNumberRange(validArgs.LM_Dec_3.min, validArgs.LM_Dec_3.max)}.`,
    };
  }
  if (filters.sqft !== null && isOutOfRange(filters.sqft, validArgs.LM_Int2_3)) {
    return {
      ok: false,
      field: "sqft",
      message:
        `That square-foot value is outside the current database range ` +
        `${formatNumberRange(validArgs.LM_Int2_3.min, validArgs.LM_Int2_3.max)}.`,
    };
  }
  if (filters.type && !listHasValue(validArgs.L_Type_, filters.type)) {
    return {
      ok: false,
      field: "type",
      message:
        "That property type is not present in the current database. Would you like to try a different type?",
    };
  }
  if (filters.pool && !listHasValue(validArgs.PoolPrivateYN, filters.pool)) {
    return {
      ok: false,
      field: "pool",
      message:
        "That pool filter value is not present in the current database. Would you like to try a different pool value?",
    };
  }
  if (filters.hasView && !listHasValue(validArgs.ViewYN, filters.hasView)) {
    return {
      ok: false,
      field: "hasView",
      message:
        "That view filter value is not present in the current database. Would you like to try a different view value?",
    };
  }
  if (filters.maxHoa !== null && isOutOfRange(filters.maxHoa, validArgs.AssociationFee)) {
    return {
      ok: false,
      field: "maxHoa",
      message:
        `That HOA value is outside the current database range ` +
        `${formatCurrencyRange(validArgs.AssociationFee.min, validArgs.AssociationFee.max)}.`,
    };
  }

  return { ok: true };
}
