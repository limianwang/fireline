import { describe, expect, it } from "vitest";

import type { Account, FireEnvelope } from "../domain/types";
import {
  calculateBaristaFireDate,
  calculateCoastFireDate,
  calculateFirePercent,
  calculateFireTarget,
  calculateFullFireDate,
} from "./fireLenses";
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

const envelope = (overrides: Partial<FireEnvelope>): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 0,
  household_name: "Test",
  profile: {
    birth_year: 2000,
    retirement_age: 45,
    default_currency: "CAD",
  },
  accounts: [account({ id: "tfsa", annual_contribution: 100 })],
  snapshots: [
    {
      id: "latest",
      date: "2040-01-01",
      account_balances: [{ account_id: "tfsa", balance: 900 }],
    },
  ],
  assumptions: {
    annual_expenses: 40,
    withdrawal_rate: 0.04,
    inflation_rate: 0,
    barista_combined_income: 0,
    projection_end_age: 47,
  },
  ...overrides,
});

describe("FIRE target", () => {
  it("uses annual expenses divided by withdrawal rate", () => {
    expect(calculateFireTarget(envelope({}))).toEqual({
      fire_target: 1_000,
      effective_withdrawal_rate: 0.04,
    });
  });

  it("clamps non-finite targets from tiny withdrawal rates", () => {
    expect(
      calculateFireTarget(
        envelope({
          assumptions: {
            annual_expenses: 1,
            withdrawal_rate: Number.MIN_VALUE,
            inflation_rate: 0,
            barista_combined_income: 0,
            projection_end_age: 47,
          },
        }),
      ),
    ).toEqual({
      fire_target: Number.MAX_SAFE_INTEGER,
      effective_withdrawal_rate: Number.MIN_VALUE,
      warnings: [
        {
          code: "fire_target_overflow",
          message: "FIRE target exceeded finite engine range and was clamped.",
        },
      ],
    });
  });

  it("calculates FIRE percent from investable assets and FIRE target", () => {
    expect(calculateFirePercent({ investableAssets: 900, fireTarget: 1_000 }))
      .toBe(0.9);
  });

  it("returns complete percent for rate-mode zero expenses with zero investable assets", () => {
    const target = calculateFireTarget(
      envelope({
        assumptions: {
          annual_expenses: 0,
          withdrawal_rate: 0.04,
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 47,
        },
      }),
    );

    expect(calculateFirePercent({
      investableAssets: 0,
      fireTarget: target.fire_target,
    })).toBe(1);
  });

  it("returns complete percent for rate-mode zero expenses with positive investable assets", () => {
    const target = calculateFireTarget(
      envelope({
        assumptions: {
          annual_expenses: 0,
          withdrawal_rate: 0.04,
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 47,
        },
      }),
    );

    expect(calculateFirePercent({
      investableAssets: 1,
      fireTarget: target.fire_target,
    })).toBe(1);
  });
});

describe("Full FIRE", () => {
  it("returns the first projected year assets reach the FIRE target with contributions on", () => {
    const projection = projectBalances(envelope({}), {
      includeContributions: true,
    });

    expect(calculateFullFireDate({ projectionRows: projection.rows, fireTarget: 1_000 }))
      .toEqual({ year: 2041, age: 41 });
  });

  it("returns null when assets do not reach the FIRE target by projection end", () => {
    const projection = projectBalances(
      envelope({
        accounts: [account({ id: "tfsa" })],
        snapshots: [
          {
            id: "latest",
            date: "2040-01-01",
            account_balances: [{ account_id: "tfsa", balance: 100 }],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(calculateFullFireDate({ projectionRows: projection.rows, fireTarget: 1_000 }))
      .toBeNull();
  });

  it("handles already reached assets", () => {
    const projection = projectBalances(
      envelope({
        snapshots: [
          {
            id: "latest",
            date: "2040-01-01",
            account_balances: [{ account_id: "tfsa", balance: 1_200 }],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(calculateFullFireDate({ projectionRows: projection.rows, fireTarget: 1_000 }))
      .toEqual({ year: 2040, age: 40 });
  });
});

describe("Coast FIRE", () => {
  it("returns latest snapshot year when current no-contribution projection reaches by retirement", () => {
    expect(
      calculateCoastFireDate(
        envelope({
          accounts: [account({ id: "tfsa", expected_nominal_return: 0.1 })],
          snapshots: [
            {
              id: "latest",
              date: "2040-01-01",
              account_balances: [{ account_id: "tfsa", balance: 800 }],
            },
          ],
        }),
      ),
    ).toEqual({ year: 2040, age: 40 });
  });

  it("returns the first future candidate whose no-contribution projection reaches by retirement", () => {
    expect(
      calculateCoastFireDate(
        envelope({
          accounts: [
            account({
              id: "tfsa",
              expected_nominal_return: 0.1,
              annual_contribution: 100,
            }),
          ],
          snapshots: [
            {
              id: "latest",
              date: "2040-01-01",
              account_balances: [{ account_id: "tfsa", balance: 500 }],
            },
          ],
        }),
      ),
    ).toEqual({ year: 2042, age: 42 });
  });

  it("uses the latest owner retirement_age as coast horizon when multiple owners present", () => {
    // Balance=600, return=10%, FIRE target=1000 (expenses=40, rate=4%)
    // To reach 1000 from 600 needs ~12.5 years of growth
    // With retirement_age=45 (5 yrs from age 40): 600 * 1.1^5 = 966 < 1000 → null
    // With retirement_age=55 (15 yrs from age 40): 600 * 1.1^15 = 2505 > 1000 → coast at 2040
    const twoOwners = envelope({
      owners: [
        { id: "o1", name: "Early Retiree", birth_year: 2000, retirement_age: 45 },
        { id: "o2", name: "Late Retiree", birth_year: 2000, retirement_age: 55 },
      ],
      accounts: [account({ id: "tfsa", expected_nominal_return: 0.1 })],
      snapshots: [
        {
          id: "latest",
          date: "2040-01-01",
          account_balances: [{ account_id: "tfsa", balance: 600 }],
        },
      ],
      assumptions: {
        annual_expenses: 40,
        withdrawal_rate: 0.04,
        inflation_rate: 0,
        barista_combined_income: 0,
        projection_end_age: 57,
      },
    });

    expect(calculateCoastFireDate(twoOwners)).toEqual({ year: 2040, age: 40 });
  });

  it("returns null when no candidate reaches the FIRE target by retirement", () => {
    expect(
      calculateCoastFireDate(
        envelope({
          accounts: [account({ id: "tfsa", annual_contribution: 10 })],
          snapshots: [
            {
              id: "latest",
              date: "2040-01-01",
              account_balances: [{ account_id: "tfsa", balance: 100 }],
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("returns null when already past retirement age", () => {
    expect(
      calculateCoastFireDate(
        envelope({
          profile: {
            birth_year: 2000,
            retirement_age: 65,
            default_currency: "CAD",
          },
          snapshots: [
            {
              id: "latest",
              date: "2070-01-01",
              account_balances: [{ account_id: "tfsa", balance: 10_000 }],
            },
          ],
        }),
      ),
    ).toBeNull();
  });
});

describe("Barista FIRE", () => {
  it("returns the first pre-retirement year portfolio withdrawals plus barista income cover expenses", () => {
    const projection = projectBalances(
      envelope({
        accounts: [account({ id: "tfsa", annual_contribution: 250 })],
        assumptions: {
          annual_expenses: 50,
          withdrawal_rate: 0.04,
          inflation_rate: 0,
          barista_combined_income: 20,
          projection_end_age: 47,
        },
        snapshots: [
          {
            id: "latest",
            date: "2040-01-01",
            account_balances: [{ account_id: "tfsa", balance: 500 }],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(
      calculateBaristaFireDate({
        projectionRows: projection.rows,
        annualExpenses: 50,
        effectiveWithdrawalRate: 0.04,
        baristaCombinedIncome: 20,
        retirementAge: 45,
      }),
    ).toEqual({ year: 2041, age: 41 });
  });

  it("returns null when barista income and portfolio withdrawals do not cover expenses", () => {
    const projection = projectBalances(envelope({}), {
      includeContributions: true,
    });

    expect(
      calculateBaristaFireDate({
        projectionRows: projection.rows,
        annualExpenses: 100,
        effectiveWithdrawalRate: 0.04,
        baristaCombinedIncome: 0,
        retirementAge: 45,
      }),
    ).toBeNull();
  });

  it("does not evaluate the retirement-age row", () => {
    const projection = projectBalances(
      envelope({
        profile: {
          birth_year: 2000,
          retirement_age: 65,
          default_currency: "CAD",
        },
        accounts: [account({ id: "tfsa", annual_contribution: 250 })],
        assumptions: {
          annual_expenses: 50,
          withdrawal_rate: 0.04,
          inflation_rate: 0,
          barista_combined_income: 20,
          projection_end_age: 65,
        },
        snapshots: [
          {
            id: "latest",
            date: "2064-01-01",
            account_balances: [{ account_id: "tfsa", balance: 500 }],
          },
        ],
      }),
      { includeContributions: true },
    );

    expect(
      calculateBaristaFireDate({
        projectionRows: projection.rows,
        annualExpenses: 50,
        effectiveWithdrawalRate: 0.04,
        baristaCombinedIncome: 20,
        retirementAge: 65,
      }),
    ).toBeNull();
  });
});
