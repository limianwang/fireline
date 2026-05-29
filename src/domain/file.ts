import { z } from "zod";

import { validateFireEnvelope, type FireValidationResult } from "./schema";
import type { FireEnvelope } from "./types";

export type PrepareFireExportOptions = {
  savedAt?: Date;
};

export type FireFilenameParts = {
  householdName: string;
  savedAtIso: string;
  revision: number;
};

export const parseFireJson = (json: string): FireValidationResult => {
  try {
    return validateFireEnvelope(migrateEnvelope(JSON.parse(json)));
  } catch {
    return {
      success: false,
      error: new z.ZodError([
        {
          code: "custom",
          message: "Invalid JSON",
          path: [],
        },
      ]),
    };
  }
};

const migrateEnvelope = (raw: unknown): unknown => {
  if (typeof raw !== "object" || raw === null) return raw;
  const obj = raw as Record<string, unknown>;
  const profile = obj["profile"];
  if (typeof profile !== "object" || profile === null) return obj;
  const p = profile as Record<string, unknown>;
  const assumptions = obj["assumptions"];
  const projectionEndAge =
    typeof assumptions === "object" && assumptions !== null
      ? (assumptions as Record<string, unknown>)["projection_end_age"]
      : undefined;

  if (Array.isArray(obj["owners"])) {
    return {
      ...obj,
      owners: obj["owners"].map((owner) =>
        typeof owner === "object" && owner !== null
          ? {
              projection_end_age: projectionEndAge,
              ...owner,
            }
          : owner,
      ),
    };
  }

  return {
    ...obj,
    owners: [
      {
        id: "owner-primary",
        name: "Primary",
        birth_year: p["birth_year"],
        retirement_age: p["retirement_age"],
        projection_end_age: projectionEndAge,
      },
    ],
  };
};

export const prepareFireExport = (
  envelope: FireEnvelope,
  options: PrepareFireExportOptions = {},
): FireEnvelope => {
  const savedAt = options.savedAt ?? new Date();

  return {
    ...envelope,
    saved_at: savedAt.toISOString(),
    revision: envelope.revision + 1,
  };
};

export const generateFireFilename = ({
  householdName,
  savedAtIso,
  revision,
}: FireFilenameParts): string => {
  const safeHouseholdName = householdName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const householdSlug = safeHouseholdName || "household";

  return `fire-${householdSlug}-${savedAtIso}-r${revision}.json`;
};
