import { buildEngineViewModel } from "../engine/viewModel";
import { fisherRealReturn } from "../engine/projection";
import { sortSnapshotsByDate } from "../engine/snapshots";
import type { Account, AccountBalance, FireEnvelope, Snapshot } from "../domain/types";
import type { HouseholdState } from "./store";

export const selectHasUnsavedChanges = (state: HouseholdState): boolean =>
  JSON.stringify(state.current) !== JSON.stringify(state.baseline);

export const shouldRegisterBeforeUnload = (state: HouseholdState): boolean =>
  selectHasUnsavedChanges(state);

export const selectEngineViewModel = (state: HouseholdState) =>
  buildEngineViewModel(state.current);

export const selectAccountRealReturn = ({
  expectedNominalReturn,
  inflationRate,
}: {
  expectedNominalReturn: number;
  inflationRate: number;
}): number => fisherRealReturn(expectedNominalReturn, inflationRate);

export type SnapshotRow = {
  snapshot: Snapshot;
  isLatest: boolean;
  netWorth: number;
  investableAssets: number;
  balanceChange?: {
    dollarDelta: number;
    percentDelta?: number;
  };
};

export const selectLatestAccountBalances = (
  envelope: FireEnvelope,
): Record<string, number> => {
  const latestSnapshot = sortSnapshotsByDate(envelope.snapshots).at(-1);
  if (!latestSnapshot) {
    return {};
  }

  return Object.fromEntries(
    latestSnapshot.account_balances.map((balance) => [
      balance.account_id,
      balance.balance,
    ]),
  );
};

export const selectSnapshotRows = (
  envelope: FireEnvelope,
  options: { limit?: number | "all" } = {},
): SnapshotRow[] => {
  const sortedSnapshots = sortSnapshotsByDate(envelope.snapshots);
  const latestSnapshotId = sortedSnapshots.at(-1)?.id;
  const rows = sortedSnapshots
    .map((snapshot, index): SnapshotRow => {
      const priorSnapshot = sortedSnapshots[index - 1];
      const netWorth = sumSnapshotBalances(envelope.accounts, snapshot, () => true);
      const priorNetWorth = priorSnapshot
        ? sumSnapshotBalances(envelope.accounts, priorSnapshot, () => true)
        : undefined;
      const dollarDelta =
        priorNetWorth !== undefined ? netWorth - priorNetWorth : undefined;

      return {
        snapshot,
        isLatest: snapshot.id === latestSnapshotId,
        netWorth,
        investableAssets: sumSnapshotBalances(
          envelope.accounts,
          snapshot,
          (account) => account.include_in_fire,
        ),
        ...(dollarDelta !== undefined
          ? {
              balanceChange: {
                dollarDelta,
                ...(priorNetWorth && priorNetWorth > 0
                  ? { percentDelta: dollarDelta / priorNetWorth }
                  : {}),
              },
            }
          : {}),
      };
    })
    .reverse();

  return options.limit === "all" ? rows : rows.slice(0, options.limit ?? 6);
};

export const selectSnapshotBalancePrefill = (
  envelope: FireEnvelope,
): AccountBalance[] => {
  const latestBalances = selectLatestAccountBalances(envelope);

  return envelope.accounts
    .filter((account) => !account.archived)
    .map((account) => ({
      account_id: account.id,
      balance: latestBalances[account.id] ?? 0,
    }));
};

export const hasDuplicateSnapshotDate = (
  envelope: FireEnvelope,
  date: string,
  ignoredSnapshotId?: string,
): boolean =>
  envelope.snapshots.some(
    (snapshot) => snapshot.date === date && snapshot.id !== ignoredSnapshotId,
  );

const sumSnapshotBalances = (
  accounts: Account[],
  snapshot: Snapshot,
  includeAccount: (account: Account) => boolean,
): number => {
  const balances = new Map(
    snapshot.account_balances.map((balance) => [
      balance.account_id,
      balance.balance,
    ]),
  );

  return accounts
    .filter(includeAccount)
    .reduce((total, account) => total + (balances.get(account.id) ?? 0), 0);
};
