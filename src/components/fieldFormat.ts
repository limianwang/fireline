export type FieldParseResult =
  | { success: true; value: number }
  | { success: false; message: string };

export const formatMoney = (value: number): string =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 2,
  }).format(value);

export const formatPercent = (value: number): string =>
  `${formatTrimmedNumber(value * 100, 2)}%`;

export const formatTimestamp = (isoTimestamp: string): string => {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const parseMoneyInput = (rawValue: string): FieldParseResult => {
  const normalized = rawValue.trim().replace(/[$,\s]/g, "");
  if (!isPlainNumber(normalized)) {
    return { success: false, message: "Enter a valid dollar amount." };
  }

  const value = Number(normalized);
  if (value < 0) {
    return {
      success: false,
      message: "Enter a dollar amount greater than or equal to 0.",
    };
  }

  return { success: true, value };
};

export const parsePercentInput = (rawValue: string): FieldParseResult => {
  const normalized = rawValue.trim().replace(/%/g, "");
  if (!isPlainNumber(normalized)) {
    return { success: false, message: "Enter a valid percentage." };
  }

  return { success: true, value: Number(normalized) / 100 };
};

export const parseIntegerInput = (
  rawValue: string,
  { min, max }: { min: number; max: number },
): FieldParseResult => {
  const normalized = rawValue.trim();
  if (!/^-?\d+$/.test(normalized)) {
    return { success: false, message: "Enter a whole number." };
  }

  const value = Number(normalized);
  if (value < min || value > max) {
    return {
      success: false,
      message: `Enter a whole number from ${min} to ${max}.`,
    };
  }

  return { success: true, value };
};

const isPlainNumber = (value: string): boolean =>
  /^-?(?:\d+|\d*\.\d+)$/.test(value) && Number.isFinite(Number(value));

const formatTrimmedNumber = (value: number, maximumFractionDigits: number): string =>
  new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
