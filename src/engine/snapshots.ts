import type { FireEnvelope, Snapshot } from "../domain/types";
import { resolvePlanningBirthYear } from "./ownerAssumptions";

export type EngineWarning =
  | {
      code: "no_snapshots";
      message: string;
    }
  | {
      code: "return_rate_below_0_percent";
      account_id: string;
      message: string;
    }
  | {
      code: "return_rate_above_15_percent";
      account_id: string;
      message: string;
    }
  | {
      code: "portfolio_depleted_at_age";
      age: number;
      message: string;
    }
  | {
      code: "fire_target_overflow";
      message: string;
    };

export type PriorAndLatestSnapshots = {
  sortedSnapshots: Snapshot[];
  priorSnapshot?: Snapshot;
  latestSnapshot?: Snapshot;
};

export type SnapshotNow = PriorAndLatestSnapshots & {
  currentYear?: number;
  currentAge?: number;
  warnings: EngineWarning[];
};

export const sortSnapshotsByDate = (snapshots: Snapshot[]): Snapshot[] =>
  [...snapshots].sort((first, second) => first.date.localeCompare(second.date));

export const getPriorAndLatestSnapshots = (
  snapshots: Snapshot[],
): PriorAndLatestSnapshots => {
  const sortedSnapshots = sortSnapshotsByDate(snapshots);
  const latestSnapshot = sortedSnapshots.at(-1);
  const priorSnapshot =
    sortedSnapshots.length >= 2 ? sortedSnapshots.at(-2) : undefined;

  return {
    sortedSnapshots,
    priorSnapshot,
    latestSnapshot,
  };
};

export const deriveSnapshotNow = (envelope: FireEnvelope): SnapshotNow => {
  const snapshots = getPriorAndLatestSnapshots(envelope.snapshots);

  if (!snapshots.latestSnapshot) {
    return {
      ...snapshots,
      warnings: [
        {
          code: "no_snapshots",
          message: "No snapshots available for deterministic engine date.",
        },
      ],
    };
  }

  const currentYear = Number(snapshots.latestSnapshot.date.slice(0, 4));

  return {
    ...snapshots,
    currentYear,
    currentAge: currentYear - resolvePlanningBirthYear(envelope),
    warnings: [],
  };
};
