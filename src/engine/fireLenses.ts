import type { FireEnvelope } from "../domain/types";
import {
  projectBalances,
  type ProjectionRow,
} from "./projection";
import { resolveRetirementAge } from "./ownerAssumptions";
import { deriveSnapshotNow, type EngineWarning } from "./snapshots";

export type FireTargetResult = {
  fire_target: number;
  effective_withdrawal_rate: number;
  warnings?: EngineWarning[];
};

export type FireDate = {
  year: number;
  age: number;
};

export const calculateFireTarget = (
  envelope: FireEnvelope,
): FireTargetResult => {
  return toFireTargetResult({
    rawTarget:
      envelope.assumptions.annual_expenses / envelope.assumptions.withdrawal_rate,
    effective_withdrawal_rate: envelope.assumptions.withdrawal_rate,
  });
};

export const calculateFirePercent = ({
  investableAssets,
  fireTarget,
}: {
  investableAssets: number;
  fireTarget: number;
}): number => {
  if (fireTarget <= 0) {
    return 1;
  }

  return investableAssets / fireTarget;
};

export const calculateFullFireDate = ({
  projectionRows,
  fireTarget,
}: {
  projectionRows: ProjectionRow[];
  fireTarget: number;
}): FireDate | null => {
  const reachedRow = projectionRows.find(
    (row) => row.total_balance >= fireTarget,
  );

  return reachedRow ? toFireDate(reachedRow) : null;
};

export const calculateCoastFireDate = (
  envelope: FireEnvelope,
): FireDate | null => {
  const retirementAge = resolveRetirementAge(envelope);
  const snapshotNow = deriveSnapshotNow(envelope);
  if (
    !snapshotNow.latestSnapshot ||
    snapshotNow.currentAge === undefined ||
    snapshotNow.currentYear === undefined ||
    snapshotNow.currentAge > retirementAge
  ) {
    return null;
  }

  const currentAge = snapshotNow.currentAge;
  const { fire_target: fireTarget } = calculateFireTarget(envelope);
  const projectionWithContributions = projectBalances(envelope, {
    includeContributions: true,
  });
  const candidateRows = projectionWithContributions.rows.filter(
    (row) =>
      row.age >= currentAge &&
      row.age <= retirementAge,
  );

  for (const candidateRow of candidateRows) {
    const noContributionProjection = projectBalances(
      envelopeFromProjectionRow(envelope, candidateRow, retirementAge),
      { includeContributions: false },
    );
    const reachesByRetirement = noContributionProjection.rows.some(
      (row) =>
        row.age <= retirementAge &&
        row.total_balance >= fireTarget,
    );

    if (reachesByRetirement) {
      return toFireDate(candidateRow);
    }
  }

  return null;
};

export const calculateBaristaFireDate = ({
  projectionRows,
  annualExpenses,
  effectiveWithdrawalRate,
  baristaCombinedIncome,
  retirementAge,
}: {
  projectionRows: ProjectionRow[];
  annualExpenses: number;
  effectiveWithdrawalRate: number;
  baristaCombinedIncome: number;
  retirementAge: number;
}): FireDate | null => {
  const reachedRow = projectionRows.find(
    (row) =>
      row.age < retirementAge &&
      row.total_balance * effectiveWithdrawalRate + baristaCombinedIncome >=
        annualExpenses,
  );

  return reachedRow ? toFireDate(reachedRow) : null;
};

const envelopeFromProjectionRow = (
  envelope: FireEnvelope,
  row: ProjectionRow,
  retirementAge: number,
): FireEnvelope => ({
  ...envelope,
  snapshots: [
    {
      id: `projection-${row.year}`,
      date: `${row.year}-01-01`,
      account_balances: Object.entries(row.account_balances).map(
        ([account_id, balance]) => ({ account_id, balance }),
      ),
    },
  ],
  assumptions: {
    ...envelope.assumptions,
    projection_end_age: retirementAge,
  },
});

const toFireDate = (row: ProjectionRow): FireDate => ({
  year: row.year,
  age: row.age,
});

const toFireTargetResult = ({
  rawTarget,
  effective_withdrawal_rate,
}: {
  rawTarget: number;
  effective_withdrawal_rate: number;
}): FireTargetResult => {
  if (Number.isFinite(rawTarget)) {
    return {
      fire_target: rawTarget,
      effective_withdrawal_rate,
    };
  }

  return {
    fire_target: Number.MAX_SAFE_INTEGER,
    effective_withdrawal_rate,
    warnings: [
      {
        code: "fire_target_overflow",
        message: "FIRE target exceeded finite engine range and was clamped.",
      },
    ],
  };
};
