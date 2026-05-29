import { describe, expect, it, vi } from "vitest";

import type { Account, FireEnvelope } from "../domain/types";
import {
  buildProjectionDisplayModel,
  buildEngineViewModel,
  toNominalProjectionRows,
  toNominalValue,
} from "./viewModel";

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const goldenEnvelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 2,
  household_name: "Golden Household",
  profile: {
    birth_year: 2000,
    retirement_age: 42,
    default_currency: "CAD",
  },
  accounts: [
    account({
      id: "tfsa",
      name: "TFSA",
      annual_contribution: 100,
      expected_nominal_return: 0,
    }),
    account({
      id: "cash",
      name: "Cash",
      include_in_fire: false,
      expected_nominal_return: 0.16,
    }),
  ],
  snapshots: [
    {
      id: "prior",
      date: "2039-01-01",
      account_balances: [
        { account_id: "tfsa", balance: 800 },
        { account_id: "cash", balance: 90 },
      ],
    },
    {
      id: "latest",
      date: "2040-01-01",
      account_balances: [
        { account_id: "tfsa", balance: 900 },
        { account_id: "cash", balance: 100 },
      ],
    },
  ],
  assumptions: {
    annual_expenses: 40,
    withdrawal_input: { kind: "rate", value: 0.04 },
    inflation_rate: 0,
    barista_combined_income: 0,
    projection_end_age: 43,
  },
});

describe("engine view model", () => {
  it("builds a stable golden view model from household JSON", () => {
    const result = buildEngineViewModel(goldenEnvelope());

    expect(result).toMatchObject({
      household_name: "Golden Household",
      current: {
        year: 2040,
        age: 40,
        net_worth: 1_000,
        investable_assets: 900,
      },
      fire: {
        fire_target: 1_000,
        effective_withdrawal_rate: 0.04,
        fire_percent: 0.9,
        gap_to_fire: -100,
        gap_at_retirement: -40,
        final_balance: 920,
        full_fire: { year: 2041, age: 41 },
        coast_fire: { year: 2041, age: 41 },
        barista_fire: { year: 2041, age: 41 },
      },
      history_rows: [
        {
          snapshot_id: "prior",
          date: "2039-01-01",
          year: 2039,
          net_worth: 890,
          investable_assets: 800,
        },
        {
          snapshot_id: "latest",
          date: "2040-01-01",
          year: 2040,
          net_worth: 1_000,
          investable_assets: 900,
        },
      ],
      history_chart_series: [
        {
          date: "2039-01-01",
          label: "2039-01-01",
          year: 2039,
          net_worth: 890,
          investable_assets: 800,
        },
        {
          date: "2040-01-01",
          label: "2040-01-01",
          year: 2040,
          net_worth: 1_000,
          investable_assets: 900,
          projected_assets: 900,
          fire_target: 1_000,
        },
        {
          label: "2041",
          year: 2041,
          projected_assets: 1_000,
          fire_target: 1_000,
        },
        {
          label: "2042",
          year: 2042,
          projected_assets: 960,
          fire_target: 1_000,
        },
        {
          label: "2043",
          year: 2043,
          projected_assets: 920,
          fire_target: 1_000,
        },
      ],
    });
    expect(result.balance_changes.accounts).toContainEqual({
      account_id: "tfsa",
      label: "balance_change",
      prior_balance: 800,
      latest_balance: 900,
      dollar_delta: 100,
      percent_delta: 0.125,
    });
    expect(result.projection_rows.map((row) => ({
      year: row.year,
      age: row.age,
      total_balance: row.total_balance,
      fire_target: row.fire_target,
    }))).toEqual([
      { year: 2040, age: 40, total_balance: 900, fire_target: 1_000 },
      { year: 2041, age: 41, total_balance: 1_000, fire_target: 1_000 },
      { year: 2042, age: 42, total_balance: 960, fire_target: 1_000 },
      { year: 2043, age: 43, total_balance: 920, fire_target: 1_000 },
    ]);
    expect(result.projection_chart_series[0]).toEqual({
      year: 2040,
      age: 40,
      total_balance: 900,
      fire_target: 1_000,
      tfsa: 900,
    });
    expect(result.warnings).toContainEqual({
      code: "return_rate_above_15_percent",
      account_id: "cash",
      message: "Cash expected nominal return is above 15%.",
    });
  });

  it("returns identical view models for identical JSON inputs", () => {
    const first = buildEngineViewModel(goldenEnvelope());
    const second = buildEngineViewModel(goldenEnvelope());

    expect(second).toEqual(first);
  });

  it("does not change output when the wall clock changes", () => {
    const envelope = goldenEnvelope();

    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-05-27T00:00:00.000Z"));
      const first = buildEngineViewModel(envelope);

      vi.setSystemTime(new Date("2099-12-31T23:59:59.999Z"));
      const second = buildEngineViewModel(envelope);

      expect(second).toEqual(first);
      expect(second.current).toMatchObject({ year: 2040, age: 40 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes archived FIRE accounts in history investable assets", () => {
    const result = buildEngineViewModel({
      ...goldenEnvelope(),
      accounts: [
        account({ id: "tfsa", name: "TFSA" }),
        account({
          id: "archived-fire",
          name: "Archived FIRE",
          archived: true,
        }),
        account({ id: "cash", name: "Cash", include_in_fire: false }),
      ],
      snapshots: [
        {
          id: "latest",
          date: "2040-01-01",
          account_balances: [
            { account_id: "tfsa", balance: 900 },
            { account_id: "archived-fire", balance: 300 },
            { account_id: "cash", balance: 100 },
          ],
        },
      ],
    });

    expect(result.history_rows).toContainEqual({
      snapshot_id: "latest",
      date: "2040-01-01",
      year: 2040,
      net_worth: 1_300,
      investable_assets: 1_200,
    });
    expect(result.history_chart_series[0]).toMatchObject({
      snapshot_id: "latest",
      net_worth: 1_300,
      investable_assets: 1_200,
    });
  });

  it("emits finite FIRE percent when rate-mode annual expenses are zero", () => {
    const result = buildEngineViewModel({
      ...goldenEnvelope(),
      assumptions: {
        annual_expenses: 0,
        withdrawal_input: { kind: "rate", value: 0.04 },
        inflation_rate: 0,
        barista_combined_income: 0,
        projection_end_age: 43,
      },
    });

    expect(result.fire.fire_target).toBe(0);
    expect(result.fire.fire_percent).toBe(1);
    expect(Number.isFinite(result.fire.fire_percent)).toBe(true);
  });

  it("keeps FIRE target, percent, and gap finite when raw targets overflow", () => {
    const overflowEnvelopes: FireEnvelope[] = [
      {
        ...goldenEnvelope(),
        assumptions: {
          annual_expenses: 1,
          withdrawal_input: { kind: "rate", value: Number.MIN_VALUE },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 43,
        },
      },
      {
        ...goldenEnvelope(),
        assumptions: {
          annual_expenses: 40,
          withdrawal_input: {
            kind: "fixed_annual_withdrawal",
            value: Number.MAX_VALUE,
          },
          inflation_rate: 0,
          barista_combined_income: 0,
          projection_end_age: 43,
        },
      },
    ];

    for (const result of overflowEnvelopes.map(buildEngineViewModel)) {
      expect(result.fire.fire_target).toBe(Number.MAX_SAFE_INTEGER);
      expect(Number.isFinite(result.fire.fire_target)).toBe(true);
      expect(Number.isFinite(result.fire.fire_percent)).toBe(true);
      expect(Number.isFinite(result.fire.gap_at_retirement)).toBe(true);
      expect(result.projection_rows.every((row) => Number.isFinite(row.fire_target)))
        .toBe(true);
      expect(
        result.projection_chart_series.every((point) =>
          Number.isFinite(point.fire_target),
        ),
      ).toBe(true);
      expect(result.warnings).toContainEqual({
        code: "fire_target_overflow",
        message: "FIRE target exceeded finite engine range and was clamped.",
      });
    }
  });

  it("keeps nominal display conversion isolated from real engine rows", () => {
    expect(toNominalValue({ realValue: 100, inflationRate: 0.03, yearsElapsed: 2 }))
      .toBeCloseTo(106.09);

    const nominalRows = toNominalProjectionRows(
      [
        {
          year: 2040,
          age: 40,
          account_balances: { tfsa: 100 },
          total_balance: 100,
          fire_target: 1_000,
        },
        {
          year: 2041,
          age: 41,
          account_balances: { tfsa: 110 },
          total_balance: 110,
          fire_target: 1_000,
        },
      ],
      { startYear: 2040, inflationRate: 0.1 },
    );

    expect(nominalRows[0]).toEqual({
      year: 2040,
      age: 40,
      account_balances: { tfsa: 100 },
      total_balance: 100,
      fire_target: 1_000,
    });
    expect(nominalRows[1]?.year).toBe(2041);
    expect(nominalRows[1]?.age).toBe(41);
    expect(nominalRows[1]?.account_balances.tfsa).toBeCloseTo(121);
    expect(nominalRows[1]?.total_balance).toBeCloseTo(121);
    expect(nominalRows[1]?.fire_target).toBe(1_100);
  });

  it("builds projection display rows without mutating contribution assumptions", () => {
    const envelope = {
      ...goldenEnvelope(),
      assumptions: {
        ...goldenEnvelope().assumptions,
        inflation_rate: 0,
      },
    };

    const withContributions = buildProjectionDisplayModel(envelope, {
      displayMode: "real",
      includeContributions: true,
    });
    const withoutContributions = buildProjectionDisplayModel(envelope, {
      displayMode: "real",
      includeContributions: false,
    });

    expect(withContributions.rows.map((row) => row.total_balance)).toEqual([
      900, 1_000, 960, 920,
    ]);
    expect(withoutContributions.rows.map((row) => row.total_balance)).toEqual([
      900, 900, 860, 820,
    ]);
    expect(envelope.accounts[0]?.annual_contribution).toBe(100);
  });

  it("inflates projection display rows and target only for nominal display", () => {
    const envelope = {
      ...goldenEnvelope(),
      accounts: [
        account({
          id: "tfsa",
          name: "TFSA",
          expected_nominal_return: 0.1,
          annual_contribution: 100,
        }),
        account({
          id: "cash",
          name: "Cash",
          include_in_fire: false,
          expected_nominal_return: 0.16,
        }),
      ],
      assumptions: {
        ...goldenEnvelope().assumptions,
        inflation_rate: 0.1,
      },
    };

    const display = buildProjectionDisplayModel(envelope, {
      displayMode: "nominal",
      includeContributions: false,
    });

    expect(display.rows[0]?.total_balance).toBe(900);
    expect(display.rows[1]?.total_balance).toBeCloseTo(990);
    expect(display.rows[1]?.fire_target).toBeCloseTo(1_100);
    expect(display.chart_series[1]?.tfsa).toBeCloseTo(990);
  });

  it("marks lens and retirement years in projection display rows", () => {
    const display = buildProjectionDisplayModel(goldenEnvelope(), {
      displayMode: "real",
      includeContributions: true,
    });

    expect(display.markers).toEqual([
      { key: "coast_fire", label: "Coast", year: 2041, age: 41 },
      { key: "barista_fire", label: "Barista", year: 2041, age: 41 },
      { key: "full_fire", label: "Full FIRE", year: 2041, age: 41 },
      { key: "retirement", label: "Retirement", year: 2042, age: 42 },
    ]);
    expect(display.rows.find((row) => row.year === 2041)?.markers).toEqual([
      "Coast",
      "Barista",
      "Full FIRE",
    ]);
    expect(display.rows.find((row) => row.year === 2042)?.markers).toEqual([
      "Retirement",
    ]);
  });

  it("does not carry contribution-path coast markers into no-contribution projection display", () => {
    const display = buildProjectionDisplayModel(goldenEnvelope(), {
      displayMode: "real",
      includeContributions: false,
    });

    expect(display.markers.map((marker) => marker.label)).toEqual(["Retirement"]);
    expect(display.rows.find((row) => row.year === 2041)?.markers).toEqual([]);
  });
});
