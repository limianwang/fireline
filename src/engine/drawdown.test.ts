import { describe, expect, it } from "vitest";

import type { Account, FireEnvelope } from "../domain/types";
import { projectBalances } from "./projection";

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const retirementEnvelope = (overrides: Partial<FireEnvelope>): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 0,
  household_name: "Test",
  profile: {
    birth_year: 2000,
    retirement_age: 41,
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

describe("post-retirement drawdown", () => {
  it("grows accounts first and draws expenses proportionally", () => {
    const result = projectBalances(
      retirementEnvelope({
        accounts: [
          account({ id: "tfsa", expected_nominal_return: 0.1 }),
          account({ id: "rrsp", expected_nominal_return: 0 }),
        ],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "tfsa", balance: 100 },
              { account_id: "rrsp", balance: 100 },
            ],
          },
        ],
        assumptions: {
          annual_expenses: 42,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 41,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows[1]?.total_pre_draw).toBe(210);
    expect(result.rows[1]?.account_draws).toEqual({
      tfsa: 22,
      rrsp: 20,
    });
    expect(result.rows[1]?.account_balances.tfsa).toBeCloseTo(88);
    expect(result.rows[1]?.account_balances.rrsp).toBeCloseTo(80);
  });

  it("emits portfolio_depleted_at_age warning when total crosses below zero", () => {
    const result = projectBalances(
      retirementEnvelope({
        assumptions: {
          annual_expenses: 150,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 42,
        },
      }),
      { includeContributions: true },
    );

    expect(result.warnings).toContainEqual({
      code: "portfolio_depleted_at_age",
      age: 41,
      message: "Projected FIRE portfolio depletes at age 41.",
    });
  });

  it("does not emit a depletion warning when total remains non-negative", () => {
    const result = projectBalances(
      retirementEnvelope({
        assumptions: {
          annual_expenses: 20,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 42,
        },
      }),
      { includeContributions: true },
    );

    expect(result.warnings).toEqual([]);
  });

  it("continues projection after balances become negative", () => {
    const result = projectBalances(
      retirementEnvelope({
        assumptions: {
          annual_expenses: 150,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 42,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows.map((row) => row.total_balance)).toEqual([
      100,
      -50,
      -200,
    ]);
  });

  it("applies zero-total drawdown to the first included account and emits depletion", () => {
    const result = projectBalances(
      retirementEnvelope({
        accounts: [account({ id: "first" }), account({ id: "second" })],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "first", balance: 0 },
              { account_id: "second", balance: 0 },
            ],
          },
        ],
        assumptions: {
          annual_expenses: 50,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 41,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows[1]?.total_pre_draw).toBe(0);
    expect(result.rows[1]?.account_draws).toEqual({
      first: 50,
      second: 0,
    });
    expect(result.rows[1]?.account_balances).toEqual({
      first: -50,
      second: 0,
    });
    expect(result.rows[1]?.total_balance).toBe(-50);
    expect(result.warnings).toContainEqual({
      code: "portfolio_depleted_at_age",
      age: 41,
      message: "Projected FIRE portfolio depletes at age 41.",
    });
  });

  it("uses positive shares for mixed zero-sum drawdown and decreases total by expenses", () => {
    const result = projectBalances(
      retirementEnvelope({
        accounts: [account({ id: "positive" }), account({ id: "negative" })],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "positive", balance: 100 },
              { account_id: "negative", balance: -100 },
            ],
          },
        ],
        assumptions: {
          annual_expenses: 30,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 41,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows[1]?.total_pre_draw).toBe(0);
    expect(result.rows[1]?.account_draws).toEqual({
      positive: 30,
      negative: 0,
    });
    expect(result.rows[1]?.account_balances).toEqual({
      positive: 70,
      negative: -100,
    });
    expect(result.rows[1]?.total_balance).toBe(-30);
  });

  it("warns at first post-retirement draw year when there are no accounts", () => {
    const result = projectBalances(
      retirementEnvelope({
        accounts: [],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [],
          },
        ],
        assumptions: {
          annual_expenses: 50,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 41,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows[1]?.total_pre_draw).toBe(0);
    expect(result.rows[1]?.account_draws).toEqual({});
    expect(result.rows[1]?.account_balances).toEqual({});
    expect(result.rows[1]?.total_balance).toBe(0);
    expect(result.warnings).toContainEqual({
      code: "portfolio_depleted_at_age",
      age: 41,
      message: "Projected FIRE portfolio depletes at age 41.",
    });
  });

  it("warns at first post-retirement draw year when all accounts are excluded or archived", () => {
    const result = projectBalances(
      retirementEnvelope({
        accounts: [
          account({ id: "excluded", include_in_fire: false }),
          account({ id: "archived", archived: true }),
        ],
        snapshots: [
          {
            id: "snapshot",
            date: "2040-01-01",
            account_balances: [
              { account_id: "excluded", balance: 100 },
              { account_id: "archived", balance: 100 },
            ],
          },
        ],
        assumptions: {
          annual_expenses: 50,
          withdrawal_input: { kind: "rate", value: 0.04 },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 41,
        },
      }),
      { includeContributions: true },
    );

    expect(result.rows[1]?.account_balances).toEqual({});
    expect(result.rows[1]?.total_balance).toBe(0);
    expect(result.warnings).toContainEqual({
      code: "portfolio_depleted_at_age",
      age: 41,
      message: "Projected FIRE portfolio depletes at age 41.",
    });
  });
});
