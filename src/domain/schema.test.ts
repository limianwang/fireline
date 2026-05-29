import { describe, expect, it } from "vitest";

import {
  formatValidationErrors,
  validateFireEnvelope,
  type FireEnvelope,
  type Owner,
} from "./schema";

const validEnvelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T14:30:22.000Z",
  revision: 3,
  household_name: "Sample Household",
  profile: {
    birth_year: 1988,
    retirement_age: 60,
    default_currency: "CAD",
  },
  accounts: [
    {
      id: "account-1",
      name: "TFSA",
      type: "tfsa",
      expected_nominal_return: 0.07,
      annual_contribution: 7000,
      include_in_fire: true,
      archived: false,
    },
  ],
  snapshots: [
    {
      id: "snapshot-1",
      date: "2026-05-27",
      label: "May 2026",
      notes: "Initial snapshot",
      account_balances: [{ account_id: "account-1", balance: 125000 }],
    },
  ],
  assumptions: {
    annual_expenses: 72000,
    withdrawal_input: { kind: "rate", value: 0.04 },
    inflation_rate: 0.025,
    barista_combined_income: 25000,
    projection_end_age: 90,
  },
});

describe("FIRE envelope schema", () => {
  it("validates a sample envelope", () => {
    const result = validateFireEnvelope(validEnvelope());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.household_name).toBe("Sample Household");
    }
  });

  it("rejects unknown root fields with field paths", () => {
    const result = validateFireEnvelope({
      ...validEnvelope(),
      unexpected: true,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "unexpected" }),
      );
    }
  });

  it("rejects duplicate snapshot dates", () => {
    const envelope = validEnvelope();
    envelope.snapshots.push({
      id: "snapshot-2",
      date: "2026-05-27",
      account_balances: [{ account_id: "account-1", balance: 130000 }],
    });

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "snapshots.1.date" }),
      );
    }
  });

  it("rejects duplicate account ids", () => {
    const envelope = validEnvelope();
    envelope.accounts.push({
      id: "account-1",
      name: "Duplicate TFSA",
      type: "tfsa",
      expected_nominal_return: 0.05,
      annual_contribution: 0,
      include_in_fire: true,
      archived: false,
    });

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "accounts.1.id" }),
      );
    }
  });

  it("rejects duplicate snapshot ids", () => {
    const envelope = validEnvelope();
    envelope.snapshots.push({
      id: "snapshot-1",
      date: "2026-06-27",
      account_balances: [{ account_id: "account-1", balance: 130000 }],
    });

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "snapshots.1.id" }),
      );
    }
  });

  it("rejects duplicate account balances within a snapshot", () => {
    const envelope = validEnvelope();
    envelope.snapshots[0]?.account_balances.push({
      account_id: "account-1",
      balance: 130000,
    });

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({
          path: "snapshots.0.account_balances.1.account_id",
        }),
      );
    }
  });

  it("rejects snapshots that reference missing accounts", () => {
    const envelope = validEnvelope();
    envelope.snapshots[0]?.account_balances.push({
      account_id: "missing-account",
      balance: 50,
    });

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({
          path: "snapshots.0.account_balances.1.account_id",
        }),
      );
    }
  });

  it("rejects invalid withdrawal inputs", () => {
    const envelope = validEnvelope();
    envelope.assumptions.withdrawal_input = {
      kind: "rate",
      value: 0,
    };

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "assumptions.withdrawal_input.value" }),
      );
    }
  });

  it("rejects invalid inflation rates", () => {
    const envelope = validEnvelope();
    envelope.assumptions.inflation_rate = 1.01;

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "assumptions.inflation_rate" }),
      );
    }
  });

  it("rejects projection end age before retirement age", () => {
    const envelope = validEnvelope();
    envelope.assumptions.projection_end_age = 50;

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual({
        path: "assumptions.projection_end_age",
        message: "Projection end age must be greater than or equal to retirement age",
      });
    }
  });

  it("rejects whitespace-only durable strings without trimming input", () => {
    const envelope = validEnvelope();
    envelope.household_name = "   ";
    envelope.accounts[0]!.name = "\t";
    envelope.profile.default_currency = "\n";

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      const formattedErrors = formatValidationErrors(result.error);
      expect(formattedErrors).toContainEqual(
        expect.objectContaining({ path: "household_name" }),
      );
      expect(formattedErrors).toContainEqual(
        expect.objectContaining({ path: "accounts.0.name" }),
      );
      expect(formattedErrors).toContainEqual(
        expect.objectContaining({ path: "profile.default_currency" }),
      );
    }
  });

  it("rejects whitespace-only snapshot notes", () => {
    const envelope = validEnvelope();
    envelope.snapshots[0]!.notes = "   ";

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "snapshots.0.notes" }),
      );
    }
  });
});

describe("owners", () => {
  const owner = (overrides?: Partial<Owner>): Owner => ({
    id: "owner-1",
    name: "Alex",
    birth_year: 1988,
    retirement_age: 55,
    projection_end_age: 90,
    ...overrides,
  });

  it("validates an envelope with an owners array", () => {
    const envelope = validEnvelope();
    envelope.owners = [owner()];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("validates an envelope with multiple owners", () => {
    const envelope = validEnvelope();
    envelope.owners = [
      owner({ id: "owner-1", name: "Alex", birth_year: 1988, retirement_age: 55 }),
      owner({ id: "owner-2", name: "Spouse", birth_year: 1990, retirement_age: 58 }),
    ];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("rejects duplicate owner ids", () => {
    const envelope = validEnvelope();
    envelope.owners = [
      owner({ id: "owner-1" }),
      owner({ id: "owner-1", name: "Duplicate" }),
    ];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "owners.1.id" }),
      );
    }
  });

  it("rejects owner with blank name", () => {
    const envelope = validEnvelope();
    envelope.owners = [owner({ name: "  " })];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "owners.0.name" }),
      );
    }
  });

  it("rejects owner with retirement_age above 120", () => {
    const envelope = validEnvelope();
    envelope.owners = [owner({ retirement_age: 121 })];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "owners.0.retirement_age" }),
      );
    }
  });

  it("rejects owner projection end age before owner retirement age", () => {
    const envelope = validEnvelope();
    envelope.owners = [owner({ retirement_age: 60, projection_end_age: 55 })];

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({
          path: "owners.0.projection_end_age",
          message:
            "Owner projection end age must be greater than or equal to owner retirement age",
        }),
      );
    }
  });
});

describe("account owner_id", () => {
  it("validates an account with owner_id referencing an existing owner", () => {
    const envelope = validEnvelope();
    envelope.owners = [{ id: "owner-1", name: "Alex", birth_year: 1988, retirement_age: 55 }];
    envelope.accounts[0]!.owner_id = "owner-1";

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(true);
  });

  it("rejects account owner_id that references a missing owner", () => {
    const envelope = validEnvelope();
    envelope.owners = [{ id: "owner-1", name: "Alex", birth_year: 1988, retirement_age: 55 }];
    envelope.accounts[0]!.owner_id = "owner-missing";

    const result = validateFireEnvelope(envelope);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(formatValidationErrors(result.error)).toContainEqual(
        expect.objectContaining({ path: "accounts.0.owner_id" }),
      );
    }
  });
});
