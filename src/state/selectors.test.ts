import { describe, expect, it } from "vitest";

import type { Account, FireEnvelope, Snapshot } from "../domain/types";
import { createInitialHouseholdState, householdReducer } from "./store";
import {
  hasDuplicateSnapshotDate,
  selectEngineViewModel,
  selectAccountRealReturn,
  selectLatestAccountBalances,
  selectSnapshotBalancePrefill,
  selectSnapshotRows,
} from "./selectors";

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0.05,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const snapshot = (
  overrides: Partial<Snapshot> & Pick<Snapshot, "id" | "date">,
): Snapshot => ({
  id: overrides.id,
  date: overrides.date,
  label: overrides.label,
  notes: overrides.notes,
  account_balances: overrides.account_balances ?? [],
});

const envelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 1,
  household_name: "Selector Household",
  profile: {
    birth_year: 2000,
    retirement_age: 60,
    default_currency: "CAD",
  },
  assumptions: {
    annual_expenses: 40_000,
    withdrawal_rate: 0.04,
    inflation_rate: 0.02,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
  accounts: [
    account({ id: "tfsa", name: "TFSA" }),
    account({ id: "cash", name: "Cash", include_in_fire: false }),
    account({ id: "old", name: "Old account", archived: true }),
  ],
  snapshots: [
    snapshot({
      id: "s1",
      date: "2026-01-01",
      account_balances: [
        { account_id: "tfsa", balance: 10_000 },
        { account_id: "cash", balance: 1_000 },
      ],
    }),
    snapshot({
      id: "s2",
      date: "2026-02-01",
      account_balances: [
        { account_id: "tfsa", balance: 11_000 },
        { account_id: "cash", balance: 1_200 },
      ],
    }),
    snapshot({
      id: "s3",
      date: "2026-03-01",
      account_balances: [
        { account_id: "tfsa", balance: 12_000 },
        { account_id: "cash", balance: 1_400 },
      ],
    }),
    snapshot({
      id: "s4",
      date: "2026-04-01",
      account_balances: [
        { account_id: "tfsa", balance: 13_000 },
        { account_id: "cash", balance: 1_600 },
      ],
    }),
    snapshot({
      id: "s5",
      date: "2026-05-01",
      account_balances: [
        { account_id: "tfsa", balance: 14_000 },
        { account_id: "cash", balance: 1_800 },
      ],
    }),
    snapshot({
      id: "s6",
      date: "2026-06-01",
      account_balances: [
        { account_id: "tfsa", balance: 15_000 },
        { account_id: "cash", balance: 2_000 },
      ],
    }),
    snapshot({
      id: "s7",
      date: "2026-07-01",
      account_balances: [
        { account_id: "tfsa", balance: 16_000 },
        { account_id: "cash", balance: 2_200 },
      ],
    }),
  ],
});

describe("household selectors", () => {
  it("derives latest balances from the latest dated snapshot", () => {
    expect(selectLatestAccountBalances(envelope())).toEqual({
      tfsa: 16_000,
      cash: 2_200,
    });
  });

  it("returns six most recent snapshot rows by default in descending display order", () => {
    const rows = selectSnapshotRows(envelope());

    expect(rows.map((row) => row.snapshot.id)).toEqual([
      "s7",
      "s6",
      "s5",
      "s4",
      "s3",
      "s2",
    ]);
    expect(rows[0]).toMatchObject({
      isLatest: true,
      netWorth: 18_200,
      investableAssets: 16_000,
      balanceChange: {
        dollarDelta: 1_200,
        percentDelta: 1200 / 17_000,
      },
    });
  });

  it("includes archived FIRE accounts in historical snapshot investable rows", () => {
    const source = {
      ...envelope(),
      accounts: [
        account({ id: "tfsa", name: "TFSA" }),
        account({ id: "archived-fire", name: "Archived FIRE", archived: true }),
        account({ id: "cash", name: "Cash", include_in_fire: false }),
      ],
      snapshots: [
        snapshot({
          id: "latest",
          date: "2026-08-01",
          account_balances: [
            { account_id: "tfsa", balance: 16_000 },
            { account_id: "archived-fire", balance: 4_000 },
            { account_id: "cash", balance: 2_000 },
          ],
        }),
      ],
    };

    expect(selectSnapshotRows(source)[0]).toMatchObject({
      netWorth: 22_000,
      investableAssets: 20_000,
    });
  });

  it("can return all snapshot rows for the show-all view", () => {
    expect(selectSnapshotRows(envelope(), { limit: "all" }).map((row) => row.snapshot.id))
      .toEqual(["s7", "s6", "s5", "s4", "s3", "s2", "s1"]);
  });

  it("prefills new snapshot balances from latest balances for active accounts", () => {
    expect(selectSnapshotBalancePrefill(envelope())).toEqual([
      { account_id: "tfsa", balance: 16_000 },
      { account_id: "cash", balance: 2_200 },
    ]);
  });

  it("detects duplicate snapshot dates while allowing the edited snapshot date", () => {
    const source = envelope();

    expect(hasDuplicateSnapshotDate(source, "2026-07-01")).toBe(true);
    expect(hasDuplicateSnapshotDate(source, "2026-07-01", "s7")).toBe(false);
    expect(hasDuplicateSnapshotDate(source, "2026-08-01")).toBe(false);
  });

  it("derives account real return for UI display outside components", () => {
    expect(
      selectAccountRealReturn({
        expectedNominalReturn: 0.07,
        inflationRate: 0.025,
      }),
    ).toBeCloseTo(0.043902439);
  });

  it("recalculates engine now when the latest snapshot is deleted", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "snapshot_deleted",
      snapshotId: "s7",
    });

    expect(selectEngineViewModel(next).current).toMatchObject({
      year: 2026,
      age: 26,
      net_worth: 17_000,
      investable_assets: 15_000,
    });
  });
});
