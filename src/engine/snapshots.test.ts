import { describe, expect, it } from "vitest";

import type { FireEnvelope } from "../domain/types";
import { deriveSnapshotNow, getPriorAndLatestSnapshots } from "./snapshots";

const envelopeWithSnapshots = (
  snapshots: FireEnvelope["snapshots"],
): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 0,
  household_name: "Test",
  profile: {
    birth_year: 1990,
    retirement_age: 65,
    default_currency: "CAD",
  },
  accounts: [],
  snapshots,
  assumptions: {
    annual_expenses: 0,
    withdrawal_rate: 0.04,
    inflation_rate: 0.02,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
});

describe("snapshot engine helpers", () => {
  it("sorts unordered snapshots before selecting prior and latest snapshots", () => {
    const envelope = envelopeWithSnapshots([
      { id: "middle", date: "2025-01-01", account_balances: [] },
      { id: "latest", date: "2026-01-01", account_balances: [] },
      { id: "prior", date: "2024-01-01", account_balances: [] },
    ]);

    const result = getPriorAndLatestSnapshots(envelope.snapshots);

    expect(result.priorSnapshot?.id).toBe("middle");
    expect(result.latestSnapshot?.id).toBe("latest");
    expect(result.sortedSnapshots.map((snapshot) => snapshot.id)).toEqual([
      "prior",
      "middle",
      "latest",
    ]);
  });

  it("derives current age from latest snapshot year and birth year", () => {
    const envelope = envelopeWithSnapshots([
      { id: "older", date: "2025-12-31", account_balances: [] },
      { id: "latest", date: "2026-01-01", account_balances: [] },
    ]);

    const result = deriveSnapshotNow(envelope);

    expect(result.currentAge).toBe(36);
    expect(result.currentYear).toBe(2026);
    expect(result.warnings).toEqual([]);
  });

  it("returns a no-snapshot warning when no snapshots exist", () => {
    const result = deriveSnapshotNow(envelopeWithSnapshots([]));

    expect(result.latestSnapshot).toBeUndefined();
    expect(result.currentAge).toBeUndefined();
    expect(result.warnings).toContainEqual({
      code: "no_snapshots",
      message: "No snapshots available for deterministic engine date.",
    });
  });
});
