import { describe, expect, it } from "vitest";

import type { Account, Snapshot } from "../domain/types";
import { calculateBalanceChange } from "./balanceChange";

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
  id: string,
  balances: Record<string, number>,
): Snapshot => ({
  id,
  date: "2026-01-01",
  account_balances: Object.entries(balances).map(([account_id, balance]) => ({
    account_id,
    balance,
  })),
});

describe("balance change", () => {
  it("computes per-account dollar deltas for accounts in adjacent snapshots", () => {
    const result = calculateBalanceChange({
      accounts: [account({ id: "tfsa" })],
      priorSnapshot: snapshot("prior", { tfsa: 100 }),
      latestSnapshot: snapshot("latest", { tfsa: 125 }),
    });

    expect(result.accounts).toEqual([
      {
        account_id: "tfsa",
        label: "balance_change",
        prior_balance: 100,
        latest_balance: 125,
        dollar_delta: 25,
        percent_delta: 0.25,
      },
    ]);
  });

  it("omits percent delta when prior balance is zero", () => {
    const result = calculateBalanceChange({
      accounts: [account({ id: "cash" })],
      priorSnapshot: snapshot("prior", { cash: 0 }),
      latestSnapshot: snapshot("latest", { cash: 50 }),
    });

    const change = result.accounts[0];
    expect(change?.label).toBe("balance_change");
    if (change?.label === "balance_change") {
      expect(change.percent_delta).toBeUndefined();
    }
  });

  it("labels new accounts and excludes them from blended delta", () => {
    const result = calculateBalanceChange({
      accounts: [account({ id: "existing" }), account({ id: "new" })],
      priorSnapshot: snapshot("prior", { existing: 100 }),
      latestSnapshot: snapshot("latest", { existing: 110, new: 500 }),
    });

    expect(result.accounts).toContainEqual({
      account_id: "new",
      label: "new",
      latest_balance: 500,
    });
    expect(result.blended_delta).toEqual({
      prior_balance: 100,
      latest_balance: 110,
      dollar_delta: 10,
      percent_delta: 0.1,
    });
  });

  it("excludes archived accounts from delta display", () => {
    const result = calculateBalanceChange({
      accounts: [
        account({ id: "active" }),
        account({ id: "archived", archived: true }),
      ],
      priorSnapshot: snapshot("prior", { active: 100, archived: 100 }),
      latestSnapshot: snapshot("latest", { active: 125, archived: 200 }),
    });

    expect(result.accounts.map((change) => change.account_id)).toEqual([
      "active",
    ]);
  });

  it("computes blended delta across included FIRE accounts in both snapshots", () => {
    const result = calculateBalanceChange({
      accounts: [
        account({ id: "included-1" }),
        account({ id: "included-2" }),
        account({ id: "excluded", include_in_fire: false }),
      ],
      priorSnapshot: snapshot("prior", {
        "included-1": 100,
        "included-2": 200,
        excluded: 1000,
      }),
      latestSnapshot: snapshot("latest", {
        "included-1": 125,
        "included-2": 215,
        excluded: 2000,
      }),
    });

    expect(result.blended_delta).toEqual({
      prior_balance: 300,
      latest_balance: 340,
      dollar_delta: 40,
      percent_delta: 40 / 300,
    });
  });
});
