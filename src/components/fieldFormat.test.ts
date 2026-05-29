import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatPercent,
  parseIntegerInput,
  parseMoneyInput,
  parsePercentInput,
} from "./fieldFormat";

describe("field input parsing", () => {
  it("parses currency input without accepting partial numeric strings", () => {
    expect(parseMoneyInput("$72,500")).toEqual({ success: true, value: 72500 });
    expect(parseMoneyInput("12abc")).toEqual({
      success: false,
      message: "Enter a valid dollar amount.",
    });
  });

  it("rejects negative currency input when the field requires non-negative values", () => {
    expect(parseMoneyInput("-1")).toEqual({
      success: false,
      message: "Enter a dollar amount greater than or equal to 0.",
    });
  });

  it("parses percent-point input to decimals and rejects blanks", () => {
    expect(parsePercentInput("4%")).toEqual({ success: true, value: 0.04 });
    expect(parsePercentInput("")).toEqual({
      success: false,
      message: "Enter a valid percentage.",
    });
  });

  it("parses bounded integer input without silently rounding", () => {
    expect(parseIntegerInput("65", { min: 1, max: 120 })).toEqual({
      success: true,
      value: 65,
    });
    expect(parseIntegerInput("65.5", { min: 1, max: 120 })).toEqual({
      success: false,
      message: "Enter a whole number.",
    });
  });
});

describe("field display formatting", () => {
  it("formats money and percentages for compact inline fields", () => {
    expect(formatMoney(72500)).toBe("$72,500");
    expect(formatPercent(0.025)).toBe("2.5%");
  });
});
