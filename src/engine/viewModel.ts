import type { Account, FireEnvelope, Snapshot } from "../domain/types";
import { calculateBalanceChange, type BalanceChangeResult } from "./balanceChange";
import {
  calculateBaristaFireDate,
  calculateCoastFireDate,
  calculateFirePercent,
  calculateFireTarget,
  calculateFullFireDate,
  type FireDate,
} from "./fireLenses";
import { resolveRetirementAge, resolveRetirementYear } from "./ownerAssumptions";
import { projectBalances, type ProjectionRow } from "./projection";
import {
  deriveSnapshotNow,
  getPriorAndLatestSnapshots,
  sortSnapshotsByDate,
  type EngineWarning,
} from "./snapshots";

export type EngineProjectionRow = ProjectionRow & {
  fire_target: number;
};

export type ProjectionChartPoint = {
  year: number;
  age: number;
  total_balance: number;
  fire_target: number;
} & Record<string, number>;

export type ProjectionDisplayMode = "real" | "nominal";

export type ProjectionMarkerKey =
  | "coast_fire"
  | "barista_fire"
  | "full_fire"
  | "retirement";

export type ProjectionMarker = {
  key: ProjectionMarkerKey;
  label: string;
  year: number;
  age: number;
};

export type ProjectionDisplayRow = EngineProjectionRow & {
  markers: string[];
};

export type ProjectionDisplayModel = {
  accounts: Pick<Account, "id" | "name">[];
  rows: ProjectionDisplayRow[];
  chart_series: ProjectionChartPoint[];
  markers: ProjectionMarker[];
};

export type HistoryRow = {
  snapshot_id: string;
  date: string;
  year: number;
  net_worth: number;
  investable_assets: number;
};

export type HistoryChartPoint = Partial<HistoryRow> & {
  label: string;
  year: number;
  projected_assets?: number;
  fire_target?: number;
};

export type EngineViewModel = {
  household_name: string;
  current: {
    year: number;
    age: number;
    net_worth: number;
    investable_assets: number;
  } | null;
  balance_changes: BalanceChangeResult;
  fire: {
    fire_target: number;
    effective_withdrawal_rate: number;
    fire_percent: number;
    gap_to_fire: number;
    gap_at_retirement: number | null;
    final_balance: number | null;
    full_fire: FireDate | null;
    coast_fire: FireDate | null;
    barista_fire: FireDate | null;
  };
  projection_rows: EngineProjectionRow[];
  projection_chart_series: ProjectionChartPoint[];
  history_rows: HistoryRow[];
  history_chart_series: HistoryChartPoint[];
  warnings: EngineWarning[];
};

export const buildProjectionDisplayModel = (
  envelope: FireEnvelope,
  {
    displayMode,
    includeContributions,
  }: {
    displayMode: ProjectionDisplayMode;
    includeContributions: boolean;
  },
): ProjectionDisplayModel => {
  const fireTargetResult = calculateFireTarget(envelope);
  const projection = projectBalances(envelope, { includeContributions });
  const realRows = projection.rows.map((row) => ({
    ...row,
    fire_target: fireTargetResult.fire_target,
  }));
  const displayRows =
    displayMode === "nominal"
      ? toNominalProjectionRows(realRows, {
          startYear: realRows[0]?.year ?? 0,
          inflationRate: envelope.assumptions.inflation_rate,
        })
      : realRows;
  const fullFire = calculateFullFireDate({
    projectionRows: realRows,
    fireTarget: fireTargetResult.fire_target,
  });
  const baristaFire = calculateBaristaFireDate({
    projectionRows: realRows,
    annualExpenses: envelope.assumptions.annual_expenses,
    effectiveWithdrawalRate: fireTargetResult.effective_withdrawal_rate,
    baristaCombinedIncome: envelope.assumptions.barista_combined_income,
    retirementAge: resolveRetirementAge(envelope),
  });
  const coastFire = includeContributions
    ? calculateCoastFireDate(envelope)
    : calculateNoContributionCoastFireDate({
        projectionRows: realRows,
        fireTarget: fireTargetResult.fire_target,
        retirementAge: resolveRetirementAge(envelope),
      });
  const markers = [
    toProjectionMarker("coast_fire", "Coast", coastFire),
    toProjectionMarker("barista_fire", "Barista", baristaFire),
    toProjectionMarker("full_fire", "Full FIRE", fullFire),
    toProjectionMarker("retirement", "Retirement", {
      year: resolveRetirementYear(envelope),
      age: resolveRetirementAge(envelope),
    }),
  ].filter((marker): marker is ProjectionMarker => marker !== null);
  const markerLabelsByYear = markers.reduce<Map<number, string[]>>(
    (labelsByYear, marker) => {
      labelsByYear.set(marker.year, [
        ...(labelsByYear.get(marker.year) ?? []),
        marker.label,
      ]);
      return labelsByYear;
    },
    new Map(),
  );
  const rows = displayRows.map((row) => ({
    ...row,
    markers: markerLabelsByYear.get(row.year) ?? [],
  }));

  return {
    accounts: envelope.accounts
      .filter((account) => account.include_in_fire && !account.archived)
      .map((account) => ({ id: account.id, name: account.name })),
    rows,
    chart_series: rows.map(toProjectionChartPoint),
    markers,
  };
};

export const buildEngineViewModel = (
  envelope: FireEnvelope,
): EngineViewModel => {
  const snapshotNow = deriveSnapshotNow(envelope);
  const snapshots = getPriorAndLatestSnapshots(envelope.snapshots);
  const fireTargetResult = calculateFireTarget(envelope);
  const {
    fire_target: fireTarget,
    effective_withdrawal_rate: effectiveRate,
  } = fireTargetResult;
  const projection = projectBalances(envelope, { includeContributions: true });
  const projectionRows = projection.rows.map((row) => ({
    ...row,
    fire_target: fireTarget,
  }));
  const currentNetWorth = snapshots.latestSnapshot
    ? sumSnapshotBalances(envelope.accounts, snapshots.latestSnapshot, () => true)
    : 0;
  const currentInvestableAssets = snapshots.latestSnapshot
    ? sumSnapshotBalances(
        envelope.accounts,
        snapshots.latestSnapshot,
        (account) => account.include_in_fire && !account.archived,
      )
    : 0;
  const historyRows = buildHistoryRows(envelope);

  return {
    household_name: envelope.household_name,
    current:
      snapshotNow.currentYear !== undefined && snapshotNow.currentAge !== undefined
        ? {
            year: snapshotNow.currentYear,
            age: snapshotNow.currentAge,
            net_worth: currentNetWorth,
            investable_assets: currentInvestableAssets,
          }
        : null,
    balance_changes: calculateBalanceChange({
      accounts: envelope.accounts,
      priorSnapshot: snapshots.priorSnapshot,
      latestSnapshot: snapshots.latestSnapshot,
    }),
    fire: {
      fire_target: fireTarget,
      effective_withdrawal_rate: effectiveRate,
      fire_percent: calculateFirePercent({
        investableAssets: currentInvestableAssets,
        fireTarget,
      }),
      gap_to_fire: currentInvestableAssets - fireTarget,
      gap_at_retirement: calculateGapAtRetirement({
        projectionRows,
        retirementAge: resolveRetirementAge(envelope),
        fireTarget,
      }),
      final_balance: projectionRows.at(-1)?.total_balance ?? null,
      full_fire: calculateFullFireDate({
        projectionRows,
        fireTarget,
      }),
      coast_fire: calculateCoastFireDate(envelope),
      barista_fire: calculateBaristaFireDate({
        projectionRows,
        annualExpenses: envelope.assumptions.annual_expenses,
        effectiveWithdrawalRate: effectiveRate,
        baristaCombinedIncome: envelope.assumptions.barista_combined_income,
        retirementAge: resolveRetirementAge(envelope),
      }),
    },
    projection_rows: projectionRows,
    projection_chart_series: projectionRows.map(toProjectionChartPoint),
    history_rows: historyRows,
    history_chart_series: buildHistoryChartSeries({
      historyRows,
      projectionRows,
    }),
    warnings: [
      ...returnRateWarnings(envelope.accounts),
      ...(fireTargetResult.warnings ?? []),
      ...projection.warnings,
    ],
  };
};

export const toNominalValue = ({
  realValue,
  inflationRate,
  yearsElapsed,
}: {
  realValue: number;
  inflationRate: number;
  yearsElapsed: number;
}): number => realValue * (1 + inflationRate) ** yearsElapsed;

export const toNominalProjectionRows = (
  rows: EngineProjectionRow[],
  {
    startYear,
    inflationRate,
  }: {
    startYear: number;
    inflationRate: number;
  },
): EngineProjectionRow[] =>
  rows.map((row) => {
    const yearsElapsed = row.year - startYear;
    return {
      ...row,
      account_balances: Object.fromEntries(
        Object.entries(row.account_balances).map(([accountId, balance]) => [
          accountId,
          toNominalValue({ realValue: balance, inflationRate, yearsElapsed }),
        ]),
      ),
      total_balance: toNominalValue({
        realValue: row.total_balance,
        inflationRate,
        yearsElapsed,
      }),
      fire_target: toNominalValue({
        realValue: row.fire_target,
        inflationRate,
        yearsElapsed,
      }),
      ...(row.total_pre_draw !== undefined
        ? {
            total_pre_draw: toNominalValue({
              realValue: row.total_pre_draw,
              inflationRate,
              yearsElapsed,
            }),
          }
        : {}),
      ...(row.account_draws
        ? {
            account_draws: Object.fromEntries(
              Object.entries(row.account_draws).map(([accountId, draw]) => [
                accountId,
                toNominalValue({
                  realValue: draw,
                  inflationRate,
                  yearsElapsed,
                }),
              ]),
            ),
          }
        : {}),
    };
  });

const calculateGapAtRetirement = ({
  projectionRows,
  retirementAge,
  fireTarget,
}: {
  projectionRows: EngineProjectionRow[];
  retirementAge: number;
  fireTarget: number;
}): number | null => {
  const retirementRow = projectionRows.find((row) => row.age === retirementAge);
  return retirementRow ? retirementRow.total_balance - fireTarget : null;
};

const toProjectionChartPoint = (
  row: EngineProjectionRow,
): ProjectionChartPoint => ({
  year: row.year,
  age: row.age,
  total_balance: row.total_balance,
  fire_target: row.fire_target,
  ...row.account_balances,
});

const toProjectionMarker = (
  key: ProjectionMarkerKey,
  label: string,
  fireDate: FireDate | null,
): ProjectionMarker | null =>
  fireDate
    ? {
        key,
        label,
        year: fireDate.year,
        age: fireDate.age,
      }
    : null;

const calculateNoContributionCoastFireDate = ({
  projectionRows,
  fireTarget,
  retirementAge,
}: {
  projectionRows: EngineProjectionRow[];
  fireTarget: number;
  retirementAge: number;
}): FireDate | null => {
  const currentRow = projectionRows[0];
  if (!currentRow) {
    return null;
  }

  const reachesByRetirement = projectionRows.some(
    (row) => row.age <= retirementAge && row.total_balance >= fireTarget,
  );

  return reachesByRetirement
    ? { year: currentRow.year, age: currentRow.age }
    : null;
};

const buildHistoryRows = (envelope: FireEnvelope): HistoryRow[] =>
  sortSnapshotsByDate(envelope.snapshots).map((snapshot) => ({
    snapshot_id: snapshot.id,
    date: snapshot.date,
    year: Number(snapshot.date.slice(0, 4)),
    net_worth: sumSnapshotBalances(envelope.accounts, snapshot, () => true),
    investable_assets: sumSnapshotBalances(
      envelope.accounts,
      snapshot,
      (account) => account.include_in_fire,
    ),
  }));

const buildHistoryChartSeries = ({
  historyRows,
  projectionRows,
}: {
  historyRows: HistoryRow[];
  projectionRows: EngineProjectionRow[];
}): HistoryChartPoint[] => {
  if (historyRows.length === 0) {
    return [];
  }

  const latestHistoryRow = historyRows.at(-1);
  const futureProjectionRows = projectionRows.filter(
    (row) => latestHistoryRow === undefined || row.year > latestHistoryRow.year,
  );
  const latestProjectionRow = projectionRows.find(
    (row) => latestHistoryRow !== undefined && row.year === latestHistoryRow.year,
  );
  const historyPoints = historyRows.map((row) => ({
    ...row,
    label: row.date,
    ...(row === latestHistoryRow && latestProjectionRow
      ? {
          projected_assets: latestProjectionRow.total_balance,
          fire_target: latestProjectionRow.fire_target,
        }
      : {}),
  }));
  const forecastPoints = futureProjectionRows.map((row) => ({
    label: String(row.year),
    year: row.year,
    projected_assets: row.total_balance,
    fire_target: row.fire_target,
  }));

  return [...historyPoints, ...forecastPoints];
};

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

const returnRateWarnings = (accounts: Account[]): EngineWarning[] =>
  accounts.flatMap((account): EngineWarning[] => {
    if (account.expected_nominal_return < 0) {
      return [
        {
          code: "return_rate_below_0_percent" as const,
          account_id: account.id,
          message: `${account.name} expected nominal return is below 0%.`,
        },
      ];
    }

    if (account.expected_nominal_return > 0.15) {
      return [
        {
          code: "return_rate_above_15_percent" as const,
          account_id: account.id,
          message: `${account.name} expected nominal return is above 15%.`,
        },
      ];
    }

    return [];
  });
