import { z } from "zod";

export type {
  Account,
  AccountBalance,
  AccountType,
  FireEnvelope,
  HouseholdAssumptions,
  HouseholdProfile,
  Owner,
  Snapshot,
  WithdrawalInput,
} from "./types";

const isoDateTimeSchema = z.iso.datetime({ offset: true });
const localDateSchema = z.iso.date();
const finiteNumberSchema = z.number().finite();
const nonNegativeFiniteNumberSchema = finiteNumberSchema.min(0);
const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Required string cannot be blank",
  });
const optionalNonBlankStringSchema = nonBlankStringSchema.optional();

export const withdrawalInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rate"),
      value: finiteNumberSchema.gt(0).max(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("fixed_annual_withdrawal"),
      value: finiteNumberSchema.gt(0),
    })
    .strict(),
]);

export const profileSchema = z
  .object({
    birth_year: z.number().int().min(1900).max(2100),
    retirement_age: z.number().int().min(1).max(120),
    default_currency: nonBlankStringSchema,
  })
  .strict();

export const ownerSchema = z
  .object({
    id: nonBlankStringSchema,
    name: nonBlankStringSchema,
    birth_year: z.number().int().min(1900).max(2100),
    retirement_age: z.number().int().min(1).max(120),
  })
  .strict();

export const accountSchema = z
  .object({
    id: nonBlankStringSchema,
    name: nonBlankStringSchema,
    type: z.enum(["tfsa", "rrsp", "non_registered", "cash", "other_asset"]),
    owner_id: optionalNonBlankStringSchema,
    expected_nominal_return: finiteNumberSchema,
    annual_contribution: finiteNumberSchema,
    include_in_fire: z.boolean(),
    archived: z.boolean(),
  })
  .strict();

export const accountBalanceSchema = z
  .object({
    account_id: nonBlankStringSchema,
    balance: finiteNumberSchema,
  })
  .strict();

export const snapshotSchema = z
  .object({
    id: nonBlankStringSchema,
    date: localDateSchema,
    label: optionalNonBlankStringSchema,
    notes: optionalNonBlankStringSchema,
    account_balances: z.array(accountBalanceSchema),
  })
  .strict();

export const assumptionsSchema = z
  .object({
    annual_expenses: nonNegativeFiniteNumberSchema,
    withdrawal_input: withdrawalInputSchema,
    inflation_rate: finiteNumberSchema.min(-0.99).max(1),
    barista_combined_income: nonNegativeFiniteNumberSchema,
    projection_end_age: z.number().int().min(1).max(120),
  })
  .strict();

export const fireEnvelopeSchema = z
  .object({
    schema_version: z.literal(1),
    saved_at: isoDateTimeSchema,
    revision: z.number().int().min(0),
    household_name: nonBlankStringSchema,
    profile: profileSchema,
    owners: z.array(ownerSchema).optional(),
    accounts: z.array(accountSchema),
    snapshots: z.array(snapshotSchema),
    assumptions: assumptionsSchema,
  })
  .strict()
  .superRefine((envelope, ctx) => {
    if (
      envelope.assumptions.projection_end_age < envelope.profile.retirement_age
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Projection end age must be greater than or equal to retirement age",
        path: ["assumptions", "projection_end_age"],
      });
    }

    if (envelope.owners) {
      addDuplicateIssues({
        values: envelope.owners,
        getKey: (owner) => owner.id,
        pathForDuplicate: (ownerIndex) => ["owners", ownerIndex, "id"],
        label: "owner id",
        ctx,
      });

      const ownerIds = new Set(envelope.owners.map((o) => o.id));
      envelope.accounts.forEach((account, accountIndex) => {
        if (account.owner_id !== undefined && !ownerIds.has(account.owner_id)) {
          ctx.addIssue({
            code: "custom",
            message: `Account references unknown owner '${account.owner_id}'`,
            path: ["accounts", accountIndex, "owner_id"],
          });
        }
      });
    }

    addDuplicateIssues({
      values: envelope.accounts,
      getKey: (account) => account.id,
      pathForDuplicate: (accountIndex) => ["accounts", accountIndex, "id"],
      label: "account id",
      ctx,
    });

    addDuplicateIssues({
      values: envelope.snapshots,
      getKey: (snapshot) => snapshot.id,
      pathForDuplicate: (snapshotIndex) => ["snapshots", snapshotIndex, "id"],
      label: "snapshot id",
      ctx,
    });

    const seenSnapshotDates = new Map<string, number>();
    envelope.snapshots.forEach((snapshot, snapshotIndex) => {
      const firstSnapshotIndex = seenSnapshotDates.get(snapshot.date);
      if (firstSnapshotIndex !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate snapshot date also used by snapshots.${firstSnapshotIndex}.date`,
          path: ["snapshots", snapshotIndex, "date"],
        });
      } else {
        seenSnapshotDates.set(snapshot.date, snapshotIndex);
      }
    });

    const accountIds = new Set(envelope.accounts.map((account) => account.id));
    envelope.snapshots.forEach((snapshot, snapshotIndex) => {
      addDuplicateIssues({
        values: snapshot.account_balances,
        getKey: (accountBalance) => accountBalance.account_id,
        pathForDuplicate: (balanceIndex) => [
          "snapshots",
          snapshotIndex,
          "account_balances",
          balanceIndex,
          "account_id",
        ],
        label: "account balance account id",
        ctx,
      });

      snapshot.account_balances.forEach((accountBalance, balanceIndex) => {
        if (!accountIds.has(accountBalance.account_id)) {
          ctx.addIssue({
            code: "custom",
            message: `Snapshot references unknown account '${accountBalance.account_id}'`,
            path: [
              "snapshots",
              snapshotIndex,
              "account_balances",
              balanceIndex,
              "account_id",
            ],
          });
        }
      });
    });
  });

export type FireValidationError = {
  path: string;
  message: string;
};

export type FireValidationResult =
  | { success: true; data: z.infer<typeof fireEnvelopeSchema> }
  | { success: false; error: z.ZodError };

export const validateFireEnvelope = (input: unknown): FireValidationResult => {
  const result = fireEnvelopeSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error };
};

export const formatValidationErrors = (
  error: z.ZodError,
): FireValidationError[] =>
  error.issues.flatMap((issue) => {
    if (issue.code === "unrecognized_keys") {
      const parentPath = formatPath(issue.path);
      return issue.keys.map((key) => ({
        path: parentPath ? `${parentPath}.${key}` : key,
        message: `Unrecognized field '${key}'`,
      }));
    }

    return [
      {
        path: formatPath(issue.path),
        message: issue.message,
      },
    ];
  });

const formatPath = (path: PropertyKey[]): string =>
  path.map((part) => String(part)).join(".");

const addDuplicateIssues = <Value>({
  values,
  getKey,
  pathForDuplicate,
  label,
  ctx,
}: {
  values: Value[];
  getKey: (value: Value) => string;
  pathForDuplicate: (index: number) => PropertyKey[];
  label: string;
  ctx: z.RefinementCtx;
}): void => {
  const seen = new Map<string, number>();
  values.forEach((value, index) => {
    const key = getKey(value);
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate ${label} also used at index ${firstIndex}`,
        path: pathForDuplicate(index),
      });
    } else {
      seen.set(key, index);
    }
  });
};
