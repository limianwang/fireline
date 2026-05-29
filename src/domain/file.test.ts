import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { prepareFireExport, parseFireJson, generateFireFilename } from "./file";
import { createFreshHousehold } from "./sampleHousehold";
import { validateFireEnvelope, type FireEnvelope } from "./schema";

const importedEnvelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T14:30:22.000Z",
  revision: 3,
  household_name: "Sample Household",
  profile: {
    birth_year: 1988,
    retirement_age: 60,
    default_currency: "CAD",
  },
  accounts: [],
  snapshots: [],
  assumptions: {
    annual_expenses: 72000,
    withdrawal_input: { kind: "fixed_annual_withdrawal", value: 100000 },
    inflation_rate: 0.025,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
});

describe("fresh household", () => {
  it("validates with revision 0 and empty household data", () => {
    const fresh = createFreshHousehold();
    const result = validateFireEnvelope(fresh);

    expect(result.success).toBe(true);
    expect(fresh.schema_version).toBe(1);
    expect(fresh.revision).toBe(0);
    expect(fresh.profile.default_currency).toBe("CAD");
    expect(fresh.accounts).toEqual([]);
    expect(fresh.snapshots).toEqual([]);
  });

  it("exports a fresh file as revision 1", () => {
    const exported = prepareFireExport(createFreshHousehold(), {
      savedAt: new Date("2026-05-27T14:30:22.000Z"),
    });

    expect(exported.revision).toBe(1);
  });
});

describe("FIRE file helpers", () => {
  it("parses imported JSON through the strict schema", () => {
    const result = parseFireJson(JSON.stringify(importedEnvelope()));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.revision).toBe(3);
    }
  });

  it("parses the committed sample household fixture", () => {
    const fixtureJson = readFileSync(
      new URL("./sample-household.json", import.meta.url),
      "utf8",
    );

    const result = parseFireJson(fixtureJson);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accounts).toHaveLength(2);
      expect(result.data.snapshots).toHaveLength(1);
    }
  });

  it("exports imported revision 3 as revision 4", () => {
    const exported = prepareFireExport(importedEnvelope(), {
      savedAt: new Date("2026-05-27T14:30:22.000Z"),
    });

    expect(exported.revision).toBe(4);
    expect(exported.saved_at).toBe("2026-05-27T14:30:22.000Z");
  });

  it("exports JSON that validates", () => {
    const exported = prepareFireExport(importedEnvelope(), {
      savedAt: new Date("2026-05-27T14:30:22.000Z"),
    });

    expect(validateFireEnvelope(exported).success).toBe(true);
  });

  it("generates deterministic filenames from household name, timestamp, and revision", () => {
    const filename = generateFireFilename({
      householdName: "Sample Household",
      savedAtIso: "2026-05-27T14:30:22.000Z",
      revision: 4,
    });

    expect(filename).toBe("fire-sample-household-2026-05-27T14:30:22.000Z-r4.json");
  });

  it("synthesizes one owner from profile when owners field is missing", () => {
    const withoutOwners = { ...importedEnvelope() };
    const result = parseFireJson(JSON.stringify(withoutOwners));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owners).toHaveLength(1);
      expect(result.data.owners![0]!.birth_year).toBe(1988);
      expect(result.data.owners![0]!.retirement_age).toBe(60);
      expect(result.data.owners![0]!.name).toBe("Primary");
    }
  });

  it("preserves existing owners when owners field is already present", () => {
    const withOwners = {
      ...importedEnvelope(),
      owners: [
        { id: "owner-1", name: "Primary", birth_year: 1985, retirement_age: 50 },
        { id: "owner-2", name: "Spouse", birth_year: 1987, retirement_age: 52 },
      ],
    };
    const result = parseFireJson(JSON.stringify(withOwners));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.owners).toHaveLength(2);
      expect(result.data.owners![0]!.name).toBe("Primary");
    }
  });

  it("falls back to a safe household slug when sanitized household name is empty", () => {
    const filename = generateFireFilename({
      householdName: "   !!!   ",
      savedAtIso: "2026-05-27T14:30:22.000Z",
      revision: 1,
    });

    expect(filename).toBe("fire-household-2026-05-27T14:30:22.000Z-r1.json");
  });
});
