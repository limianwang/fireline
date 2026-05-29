import type { Account, Snapshot } from "../domain/types";

export type BalanceChangeLabel = "balance_change" | "new";

export type AccountBalanceChange =
  | {
      account_id: string;
      label: "balance_change";
      prior_balance: number;
      latest_balance: number;
      dollar_delta: number;
      percent_delta?: number;
    }
  | {
      account_id: string;
      label: "new";
      latest_balance: number;
    };

export type BlendedBalanceChange = {
  prior_balance: number;
  latest_balance: number;
  dollar_delta: number;
  percent_delta?: number;
};

export type BalanceChangeResult = {
  accounts: AccountBalanceChange[];
  blended_delta?: BlendedBalanceChange;
};

export const calculateBalanceChange = ({
  accounts,
  priorSnapshot,
  latestSnapshot,
}: {
  accounts: Account[];
  priorSnapshot?: Snapshot;
  latestSnapshot?: Snapshot;
}): BalanceChangeResult => {
  if (!priorSnapshot || !latestSnapshot) {
    return { accounts: [] };
  }

  const priorBalances = balanceMap(priorSnapshot);
  const latestBalances = balanceMap(latestSnapshot);
  const visibleAccounts = accounts.filter((account) => !account.archived);
  const accountChanges = visibleAccounts.flatMap(
    (account): AccountBalanceChange[] => {
      const latestBalance = latestBalances.get(account.id);
      if (latestBalance === undefined) {
        return [];
      }

      const priorBalance = priorBalances.get(account.id);
      if (priorBalance === undefined) {
        return [
          {
            account_id: account.id,
            label: "new" as const,
            latest_balance: latestBalance,
          },
        ];
      }

      const dollarDelta = latestBalance - priorBalance;
      return [
        {
          account_id: account.id,
          label: "balance_change" as const,
          prior_balance: priorBalance,
          latest_balance: latestBalance,
          dollar_delta: dollarDelta,
          ...(priorBalance > 0
            ? { percent_delta: dollarDelta / priorBalance }
            : {}),
        },
      ];
    },
  );

  return {
    accounts: accountChanges,
    blended_delta: calculateBlendedDelta({
      accounts: visibleAccounts,
      priorBalances,
      latestBalances,
    }),
  };
};

const calculateBlendedDelta = ({
  accounts,
  priorBalances,
  latestBalances,
}: {
  accounts: Account[];
  priorBalances: Map<string, number>;
  latestBalances: Map<string, number>;
}): BlendedBalanceChange | undefined => {
  const includedExistingAccounts = accounts.filter(
    (account) =>
      account.include_in_fire &&
      priorBalances.has(account.id) &&
      latestBalances.has(account.id),
  );

  if (includedExistingAccounts.length === 0) {
    return undefined;
  }

  const priorBalance = includedExistingAccounts.reduce(
    (total, account) => total + priorBalances.get(account.id)!,
    0,
  );
  const latestBalance = includedExistingAccounts.reduce(
    (total, account) => total + latestBalances.get(account.id)!,
    0,
  );
  const dollarDelta = latestBalance - priorBalance;

  return {
    prior_balance: priorBalance,
    latest_balance: latestBalance,
    dollar_delta: dollarDelta,
    ...(priorBalance > 0 ? { percent_delta: dollarDelta / priorBalance } : {}),
  };
};

const balanceMap = (snapshot: Snapshot): Map<string, number> =>
  new Map(
    snapshot.account_balances.map((balance) => [
      balance.account_id,
      balance.balance,
    ]),
  );
