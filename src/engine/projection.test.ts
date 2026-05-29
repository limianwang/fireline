import { describe, expect, it } from "vitest";

import type { Account, FireEnvelope } from "../domain/types";
import { fisherRealReturn, projectBalances } from "./projection";

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const envelope = (overrides: Partial<FireEnvelope>): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 0,
  household_name: "Test",
  profile: {
    birth_year: 2000,
    retirement_age: 65,
    default_currency: "CAD",
  },
  accounts: [account({ id: "tfsa" })],
  snapshots: [
    {
      id: "snapshot",
      date: "2040-01-01",
      account_balances: [{ account_id: "tfsa", balance: 100 }],
    },
  ],
  assumptions: {
    annual_expenses: 0,
    withdrawal_input: { kind: "rate", value: 0.04 },
    inflation_rate: 0,
    barista_combined_income: 0,
    projection_end_age: 42,
  },
  ...overrides,
});

describe("projection", () => {
  it("returns no-snapshot warning directly from projectBalances", () => {
    const result = projectBalances(envelope({ snapshots: [] }), {
      includeContributions: true,
    });

    expect(result.rows).toEqual([]);
    expect(result.warnings).toContainEqual({
      code: "no_snapshots",
      message: "No snapshots available for deterministic engine date.",
    });
  });

  it("converts nominal return to real return with the Fisher equation", () => {
    expect(fisherRealReturn(0.08, 0.03)).toBeCloseTo(1.08 / 1.03 - 1);
  });

  it("projects one account with pre-retirement contributions enabled", () => {
    const result = projectBalances(
      envelope({
        accounts: [
          account({
            id: "tfsa",
            expected_nominal_return: 0.05,
            annual_contribution: 10,
          }),
        ],
      }),
      { includeContributions: true },
    );

    expect(result.rows.map((row) => row.total_balance)).toEqual([
      100,
      115,
      130.75,
    ]);
  });

  it("projects one account without contributions when disabled", () => {
    const result = projectBalances(
      envelope({
        accounts: [
          account({
            id: "tfsa",
            expected_nominal_return: 0.05,
            annual_contribution: 10,
          }),
        ],
      }),
      { includeContributions: false },
    );

    expect(result.rows.map((row) => row.total_balance)).toEqual([
      100,
      105,
      110.25,
    ]);
  });

  it("projects included accounts only", () => {
    const result = projectBalances(
      envelope({
        accounts: [
          account({ id: "included", expected_nominal_return: 0 }),
          account({
            id: "excluded",
            expected_nominal_return: 0,
            include_in_fire: false,
          }),
        ],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "included", balance: 100 },
              { account_id: "excluded", balance: 900 },
            ],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(result.rows[0]?.account_balances).toEqual({ included: 100 });
    expect(result.rows[0]?.total_balance).toBe(100);
  });

  it("excludes archived accounts from projection", () => {
    const result = projectBalances(
      envelope({
        accounts: [
          account({ id: "active" }),
          account({ id: "archived", archived: true }),
        ],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "active", balance: 100 },
              { account_id: "archived", balance: 900 },
            ],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(result.rows[0]?.account_balances).toEqual({ active: 100 });
    expect(result.rows[0]?.total_balance).toBe(100);
  });

  it("defaults included accounts missing from the latest snapshot to zero", () => {
    const result = projectBalances(
      envelope({
        accounts: [account({ id: "included" })],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(result.rows[0]?.account_balances).toEqual({ included: 0 });
    expect(result.rows[0]?.total_balance).toBe(0);
  });

  it("emits depletion at current age when latest snapshot starts negative", () => {
    const result = projectBalances(
      envelope({
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [{ account_id: "tfsa", balance: -10 }],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(result.warnings).toContainEqual({
      code: "portfolio_depleted_at_age",
      age: 40,
      message: "Projected FIRE portfolio depletes at age 40.",
    });
  });

  it("projects through birth year plus projection end age", () => {
    const result = projectBalances(envelope({}), {
      includeContributions: true,
    });

    expect(result.rows.at(-1)).toMatchObject({
      age: 42,
      year: 2042,
    });
  });

  it("stops contributions at retirement age", () => {
    const result = projectBalances(
      envelope({
        profile: {
          birth_year: 2000,
          retirement_age: 41,
          default_currency: "CAD",
        },
        accounts: [
          account({
            id: "tfsa",
            expected_nominal_return: 0,
            annual_contribution: 10,
          }),
        ],
      }),
      { includeContributions: true },
    );

    expect(result.rows.map((row) => row.total_balance)).toEqual([
      100,
      100,
      100,
    ]);
  });
});
