import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PropertyFilters } from "./types.ts";

type SoldSearchFilters = PropertyFilters & {
  closeDateFrom?: string | null;
  closeDateTo?: string | null;
  minYearBuilt?: number | null;
  maxYearBuilt?: number | null;
};

type ValidCaliforniaSoldArgs = {
  City: string[];
  CloseDate: { min: string | null; max: string | null };
  ClosePrice: { min: number | null; max: number | null };
  BedroomsTotal: { min: number | null; max: number | null };
  BathroomsTotalInteger: { min: number | null; max: number | null };
  LivingArea: { min: number | null; max: number | null };
  YearBuilt: { min: number | null; max: number | null };
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

function formatDateRange(min: string | null, max: string | null): string {
  return `[${min ?? "N/A"}, ${max ?? "N/A"}]`;
}

function isOutOfRange(value: number, bounds: { min: number | null; max: number | null }): boolean {
  if (bounds.min !== null && value < bounds.min) return true;
  if (bounds.max !== null && value > bounds.max) return true;
  return false;
}

function listHasValue(values: string[], target: string): boolean {
  return values.some((value) => value.toLowerCase() === target.toLowerCase());
}

function isValidIsoDate(input: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
  const timestamp = Date.parse(`${input}T00:00:00.000Z`);
  return Number.isFinite(timestamp);
}

async function loadValidCaliforniaSoldArgs(): Promise<ValidCaliforniaSoldArgs> {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const jsonPath = path.join(currentDir, "valid_q_args", "valid_california_sold_args.json");
  const raw = await readFile(jsonPath, "utf8");
  return JSON.parse(raw) as ValidCaliforniaSoldArgs;
}

export async function validateSoldSearchFilters(
  filters: SoldSearchFilters,
): Promise<ValidationResult> {
  const validArgs = await loadValidCaliforniaSoldArgs();

  if (filters.city && !listHasValue(validArgs.City, filters.city)) {
    return {
      ok: false,
      field: "city",
      message: "That city is not present in the sold database, would you like to try a different city?",
    };
  }
  if (filters.maxPrice !== null && isOutOfRange(filters.maxPrice, validArgs.ClosePrice)) {
    return {
      ok: false,
      field: "maxPrice",
      message:
        `That sold price is outside the current sold database range ` +
        `${formatCurrencyRange(validArgs.ClosePrice.min, validArgs.ClosePrice.max)}.`,
    };
  }
  if (filters.beds !== null && isOutOfRange(filters.beds, validArgs.BedroomsTotal)) {
    return {
      ok: false,
      field: "beds",
      message:
        `That bedroom count is outside the current sold database range ` +
        `${formatNumberRange(validArgs.BedroomsTotal.min, validArgs.BedroomsTotal.max)}.`,
    };
  }
  if (filters.baths !== null && isOutOfRange(filters.baths, validArgs.BathroomsTotalInteger)) {
    return {
      ok: false,
      field: "baths",
      message:
        `That bathroom count is outside the current sold database range ` +
        `${formatNumberRange(validArgs.BathroomsTotalInteger.min, validArgs.BathroomsTotalInteger.max)}.`,
    };
  }
  if (filters.sqft !== null && isOutOfRange(filters.sqft, validArgs.LivingArea)) {
    return {
      ok: false,
      field: "sqft",
      message:
        `That living-area value is outside the current sold database range ` +
        `${formatNumberRange(validArgs.LivingArea.min, validArgs.LivingArea.max)}.`,
    };
  }
  if (filters.minYearBuilt !== null && filters.minYearBuilt !== undefined) {
    if (isOutOfRange(filters.minYearBuilt, validArgs.YearBuilt)) {
      return {
        ok: false,
        field: "minYearBuilt",
        message:
          `That minimum year built is outside the current sold database range ` +
          `${formatNumberRange(validArgs.YearBuilt.min, validArgs.YearBuilt.max)}.`,
      };
    }
  }
  if (filters.maxYearBuilt !== null && filters.maxYearBuilt !== undefined) {
    if (isOutOfRange(filters.maxYearBuilt, validArgs.YearBuilt)) {
      return {
        ok: false,
        field: "maxYearBuilt",
        message:
          `That maximum year built is outside the current sold database range ` +
          `${formatNumberRange(validArgs.YearBuilt.min, validArgs.YearBuilt.max)}.`,
      };
    }
  }
  if (
    filters.minYearBuilt !== null &&
    filters.minYearBuilt !== undefined &&
    filters.maxYearBuilt !== null &&
    filters.maxYearBuilt !== undefined &&
    filters.minYearBuilt > filters.maxYearBuilt
  ) {
    return {
      ok: false,
      field: "yearBuilt",
      message: "Minimum year built cannot be greater than maximum year built.",
    };
  }
  if (filters.closeDateFrom) {
    if (!isValidIsoDate(filters.closeDateFrom)) {
      return {
        ok: false,
        field: "closeDateFrom",
        message: "closeDateFrom must be a valid date in YYYY-MM-DD format.",
      };
    }
    if (validArgs.CloseDate.min && filters.closeDateFrom < validArgs.CloseDate.min) {
      return {
        ok: false,
        field: "closeDateFrom",
        message:
          `closeDateFrom is outside the sold database date range ` +
          `${formatDateRange(validArgs.CloseDate.min, validArgs.CloseDate.max)}.`,
      };
    }
  }
  if (filters.closeDateTo) {
    if (!isValidIsoDate(filters.closeDateTo)) {
      return {
        ok: false,
        field: "closeDateTo",
        message: "closeDateTo must be a valid date in YYYY-MM-DD format.",
      };
    }
    if (validArgs.CloseDate.max && filters.closeDateTo > validArgs.CloseDate.max) {
      return {
        ok: false,
        field: "closeDateTo",
        message:
          `closeDateTo is outside the sold database date range ` +
          `${formatDateRange(validArgs.CloseDate.min, validArgs.CloseDate.max)}.`,
      };
    }
  }
  if (filters.closeDateFrom && filters.closeDateTo && filters.closeDateFrom > filters.closeDateTo) {
    return {
      ok: false,
      field: "closeDate",
      message: "closeDateFrom cannot be later than closeDateTo.",
    };
  }

  return { ok: true };
}
