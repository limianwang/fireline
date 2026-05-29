import type { Account, FireEnvelope, Snapshot } from "../domain/types";
import {
  resolvePlanningBirthYear,
  resolveProjectionEndYear,
  resolveRetirementYear,
} from "./ownerAssumptions";
import { deriveSnapshotNow, type EngineWarning } from "./snapshots";

export type ProjectionOptions = {
  includeContributions: boolean;
};

export type ProjectionRow = {
  year: number;
  age: number;
  account_balances: Record<string, number>;
  total_balance: number;
  total_pre_draw?: number;
  account_draws?: Record<string, number>;
};

export type ProjectionResult = {
  rows: ProjectionRow[];
  warnings: EngineWarning[];
};

export const fisherRealReturn = (
  nominalReturn: number,
  inflationRate: number,
): number => (1 + nominalReturn) / (1 + inflationRate) - 1;

export const projectBalances = (
  envelope: FireEnvelope,
  options: ProjectionOptions,
): ProjectionResult => {
  const snapshotNow = deriveSnapshotNow(envelope);
  if (!snapshotNow.latestSnapshot || snapshotNow.currentYear === undefined) {
    return {
      rows: [],
      warnings: snapshotNow.warnings,
    };
  }

  const includedAccounts = envelope.accounts.filter(
    (account) => account.include_in_fire && !account.archived,
  );
  const latestBalances = latestIncludedBalances(
    includedAccounts,
    snapshotNow.latestSnapshot,
  );
  const startYear = snapshotNow.currentYear;
  const planningBirthYear = resolvePlanningBirthYear(envelope);
  const retirementYear = resolveRetirementYear(envelope);
  const endYear = resolveProjectionEndYear(envelope);
  const rows: ProjectionRow[] = [
    toProjectionRow({
      year: startYear,
      birthYear: planningBirthYear,
      balances: latestBalances,
    }),
  ];
  const warnings: EngineWarning[] = [...snapshotNow.warnings];
  let runningBalances = latestBalances;
  const startingTotal = totalBalance(runningBalances);
  let hasEmittedDepletionWarning = startingTotal < 0;

  if (startingTotal < 0 && snapshotNow.currentAge !== undefined) {
    warnings.push(depletionWarning(snapshotNow.currentAge));
  }

  for (let year = startYear + 1; year <= endYear; year += 1) {
    const age = year - planningBirthYear;
    const grownBalances = growAccounts({
      accounts: includedAccounts,
      balances: runningBalances,
      inflationRate: envelope.assumptions.inflation_rate,
    });

    if (year >= retirementYear) {
      const row = drawDownAccounts({
        year,
        birthYear: planningBirthYear,
        balances: grownBalances,
        annualExpenses: envelope.assumptions.annual_expenses,
      });
      runningBalances = row.account_balances;
      rows.push(row);

      if (
        !hasEmittedDepletionWarning &&
        includedAccounts.length === 0 &&
        envelope.assumptions.annual_expenses > 0
      ) {
        warnings.push(depletionWarning(age));
        hasEmittedDepletionWarning = true;
      }
    } else {
      runningBalances = applyContributions({
        accounts: includedAccounts,
        balances: grownBalances,
        includeContributions: options.includeContributions,
      });
      rows.push(
        toProjectionRow({
          year,
          birthYear: planningBirthYear,
          balances: runningBalances,
        }),
      );
    }

    const rowTotal = totalBalance(runningBalances);
    if (!hasEmittedDepletionWarning && rowTotal < 0) {
      warnings.push(depletionWarning(age));
      hasEmittedDepletionWarning = true;
    }
  }

  return {
    rows,
    warnings,
  };
};

const latestIncludedBalances = (
  accounts: Account[],
  snapshot: Snapshot,
): Record<string, number> => {
  const snapshotBalances = new Map(
    snapshot.account_balances.map((balance) => [
      balance.account_id,
      balance.balance,
    ]),
  );

  return Object.fromEntries(
    accounts.map((account) => [
      account.id,
      snapshotBalances.get(account.id) ?? 0,
    ]),
  );
};

const growAccounts = ({
  accounts,
  balances,
  inflationRate,
}: {
  accounts: Account[];
  balances: Record<string, number>;
  inflationRate: number;
}): Record<string, number> =>
  Object.fromEntries(
    accounts.map((account) => [
      account.id,
      balances[account.id] *
        (1 + fisherRealReturn(account.expected_nominal_return, inflationRate)),
    ]),
  );

const applyContributions = ({
  accounts,
  balances,
  includeContributions,
}: {
  accounts: Account[];
  balances: Record<string, number>;
  includeContributions: boolean;
}): Record<string, number> =>
  Object.fromEntries(
    accounts.map((account) => [
      account.id,
      balances[account.id] +
        (includeContributions ? account.annual_contribution : 0),
    ]),
  );

const drawDownAccounts = ({
  year,
  birthYear,
  balances,
  annualExpenses,
}: {
  year: number;
  birthYear: number;
  balances: Record<string, number>;
  annualExpenses: number;
}): ProjectionRow => {
  const totalPreDraw = totalBalance(balances);
  const accountDraws = allocateDraws({
    balances,
    totalPreDraw,
    annualExpenses,
  });
  const nextBalances = Object.fromEntries(
    Object.entries(balances).map(([accountId, balance]) => [
      accountId,
      balance - accountDraws[accountId],
    ]),
  );

  return {
    year,
    age: year - birthYear,
    account_balances: nextBalances,
    total_balance: totalBalance(nextBalances),
    total_pre_draw: totalPreDraw,
    account_draws: accountDraws,
  };
};

const allocateDraws = ({
  balances,
  totalPreDraw,
  annualExpenses,
}: {
  balances: Record<string, number>;
  totalPreDraw: number;
  annualExpenses: number;
}): Record<string, number> => {
  const entries = Object.entries(balances);

  if (totalPreDraw > 0 || annualExpenses <= 0) {
    return Object.fromEntries(
      entries.map(([accountId, balance]) => [
        accountId,
        totalPreDraw === 0 ? 0 : annualExpenses * (balance / totalPreDraw),
      ]),
    );
  }

  const positiveEntries = entries.filter(([, balance]) => balance > 0);
  const positiveTotal = positiveEntries.reduce(
    (total, [, balance]) => total + balance,
    0,
  );
  if (positiveTotal > 0) {
    const positiveDraws = new Map(
      positiveEntries.map(([accountId, balance]) => [
        accountId,
        annualExpenses * (balance / positiveTotal),
      ]),
    );

    return Object.fromEntries(
      entries.map(([accountId]) => [
        accountId,
        positiveDraws.get(accountId) ?? 0,
      ]),
    );
  }

  const fallbackAccountId = largestBalanceAccountId(entries);
  return Object.fromEntries(
    entries.map(([accountId]) => [
      accountId,
      accountId === fallbackAccountId ? annualExpenses : 0,
    ]),
  );
};

const largestBalanceAccountId = (
  entries: [string, number][],
): string | undefined =>
  entries.reduce<[string, number] | undefined>(
    (largestEntry, entry) =>
      largestEntry === undefined || entry[1] > largestEntry[1]
        ? entry
        : largestEntry,
    undefined,
  )?.[0];

const toProjectionRow = ({
  year,
  birthYear,
  balances,
}: {
  year: number;
  birthYear: number;
  balances: Record<string, number>;
}): ProjectionRow => ({
  year,
  age: year - birthYear,
  account_balances: balances,
  total_balance: totalBalance(balances),
});

const totalBalance = (balances: Record<string, number>): number =>
  Object.values(balances).reduce((total, balance) => total + balance, 0);

const depletionWarning = (age: number): EngineWarning => ({
  code: "portfolio_depleted_at_age",
  age,
  message: `Projected FIRE portfolio depletes at age ${age}.`,
});
