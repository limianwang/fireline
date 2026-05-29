import { describe, expect, it, vi } from "vitest";

import type { Account, FireEnvelope, Owner, Snapshot } from "../domain/types";
import {
  createBeforeUnloadHandler,
  createInitialHouseholdState,
  householdReducer,
  prepareHouseholdExport,
} from "./store";
import {
  selectEngineViewModel,
  selectHasUnsavedChanges,
  shouldRegisterBeforeUnload,
} from "./selectors";

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0.05,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const snapshot = (
  overrides: Partial<Snapshot> & Pick<Snapshot, "id" | "date">,
): Snapshot => ({
  id: overrides.id,
  date: overrides.date,
  label: overrides.label,
  notes: overrides.notes,
  account_balances: overrides.account_balances ?? [],
});

const envelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 1,
  household_name: "Original Household",
  profile: {
    birth_year: 1990,
    retirement_age: 60,
    default_currency: "CAD",
  },
  owners: [
    {
      id: "owner-1",
      name: "Alex",
      birth_year: 1990,
      retirement_age: 60,
      projection_end_age: 90,
    },
  ],
  assumptions: {
    annual_expenses: 40_000,
    withdrawal_rate: 0.04,
    inflation_rate: 0.02,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
  accounts: [account({ id: "tfsa", name: "TFSA" })],
  snapshots: [
    snapshot({
      id: "latest",
      date: "2026-01-01",
      account_balances: [{ account_id: "tfsa", balance: 10_000 }],
    }),
  ],
});

const withoutRequiredProfile = (
  source: FireEnvelope,
): Omit<FireEnvelope, "profile"> => {
  const { profile: _profile, ...withoutProfile } = source;
  return withoutProfile;
};

const stripVolatileFileFields = (
  source: FireEnvelope,
): Omit<FireEnvelope, "revision" | "saved_at"> => {
  const { revision: _revision, saved_at: _savedAt, ...durable } = source;
  return JSON.parse(JSON.stringify(durable));
};

describe("household reducer", () => {
  it("edits household name in memory", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "household_name_updated",
      householdName: "Updated Household",
    });

    expect(next.current.household_name).toBe("Updated Household");
    expect(state.current.household_name).toBe("Original Household");
  });

  it("adds, edits, archives, and hard-deletes only unreferenced accounts", () => {
    const state = createInitialHouseholdState(envelope());
    const newAccount = account({ id: "rrsp", name: "RRSP" });

    const added = householdReducer(state, {
      type: "account_added",
      account: newAccount,
    });
    const edited = householdReducer(added, {
      type: "account_updated",
      accountId: "rrsp",
      patch: { name: "Work RRSP", annual_contribution: 6_000 },
    });
    const archived = householdReducer(edited, {
      type: "account_archived",
      accountId: "tfsa",
    });
    const referencedDelete = householdReducer(archived, {
      type: "account_deleted_if_unreferenced",
      accountId: "tfsa",
    });
    const unreferencedDelete = householdReducer(referencedDelete, {
      type: "account_deleted_if_unreferenced",
      accountId: "rrsp",
    });

    expect(added.current.accounts.map((item) => item.id)).toEqual(["tfsa", "rrsp"]);
    expect(edited.current.accounts.find((item) => item.id === "rrsp")).toMatchObject({
      name: "Work RRSP",
      annual_contribution: 6_000,
    });
    expect(
      archived.current.accounts.find((item) => item.id === "tfsa")?.archived,
    ).toBe(true);
    expect(referencedDelete.current.accounts.map((item) => item.id)).toEqual([
      "tfsa",
      "rrsp",
    ]);
    expect(unreferencedDelete.current.accounts.map((item) => item.id)).toEqual([
      "tfsa",
    ]);
  });

  it("preserves state and exposes validation errors when adding duplicate account ids", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "account_added",
      account: account({ id: "tfsa", name: "Duplicate TFSA" }),
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "accounts.1.id",
      message: "Duplicate account id also used at index 0",
    });
  });

  it("adds, edits, and deletes snapshots", () => {
    const state = createInitialHouseholdState(envelope());
    const addedSnapshot = snapshot({
      id: "new",
      date: "2027-01-01",
      account_balances: [{ account_id: "tfsa", balance: 12_000 }],
    });

    const added = householdReducer(state, {
      type: "snapshot_added",
      snapshot: addedSnapshot,
    });
    const edited = householdReducer(added, {
      type: "snapshot_updated",
      snapshotId: "new",
      patch: { label: "Year end" },
    });
    const deleted = householdReducer(edited, {
      type: "snapshot_deleted",
      snapshotId: "new",
    });

    expect(added.current.snapshots).toHaveLength(2);
    expect(edited.current.snapshots.find((item) => item.id === "new")).toMatchObject({
      label: "Year end",
    });
    expect(deleted.current.snapshots.map((item) => item.id)).toEqual(["latest"]);
  });

  it("preserves state and exposes validation errors for duplicate snapshot ids", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "snapshot_added",
      snapshot: snapshot({ id: "latest", date: "2027-01-01" }),
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "snapshots.1.id",
      message: "Duplicate snapshot id also used at index 0",
    });
  });

  it("preserves state and exposes validation errors for duplicate snapshot dates", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "snapshot_added",
      snapshot: snapshot({ id: "new", date: "2026-01-01" }),
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "snapshots.1.date",
      message: "Duplicate snapshot date also used by snapshots.0.date",
    });
  });

  it("preserves state and exposes validation errors for unknown snapshot balance accounts", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "snapshot_added",
      snapshot: snapshot({
        id: "new",
        date: "2027-01-01",
        account_balances: [{ account_id: "missing", balance: 1 }],
      }),
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "snapshots.1.account_balances.0.account_id",
      message: "Snapshot references unknown account 'missing'",
    });
  });

  it("updates profile and assumptions fields", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(
      householdReducer(state, {
        type: "profile_updated",
        patch: { retirement_age: 55 },
      }),
      {
        type: "assumptions_updated",
        patch: { annual_expenses: 50_000 },
      },
    );

    expect(next.current.profile.retirement_age).toBe(55);
    expect(next.current.assumptions.annual_expenses).toBe(50_000);
  });

  it("preserves state and exposes validation errors for invalid assumption edits", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "assumptions_updated",
      patch: { annual_expenses: -1 },
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "assumptions.annual_expenses",
      message: "Too small: expected number to be >=0",
    });
  });

  it("preserves state and exposes validation errors when retirement age exceeds projection end age", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "profile_updated",
      patch: { retirement_age: 95 },
    });

    expect(next.current).toEqual(state.current);
    expect(next.validationErrors).toContainEqual({
      path: "assumptions.projection_end_age",
      message: "Projection end age must be greater than or equal to retirement age",
    });
  });

  it("derives the engine view model from current state", () => {
    const state = createInitialHouseholdState(envelope());

    expect(selectEngineViewModel(state)).toMatchObject({
      household_name: "Original Household",
      current: {
        net_worth: 10_000,
        investable_assets: 10_000,
      },
    });
  });
});

describe("dirty tracking", () => {
  it("is clean after import replaces current and baseline", () => {
    const edited = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Dirty Household",
    });
    const imported = householdReducer(edited, {
      type: "import_succeeded",
      envelope: envelope(),
    });

    expect(selectHasUnsavedChanges(imported)).toBe(false);
  });

  it("preserves current and baseline when raw import replacement is invalid", () => {
    const state = createInitialHouseholdState(envelope());
    const invalidEnvelope = {
      ...envelope(),
      household_name: "",
    };

    const next = householdReducer(state, {
      type: "import_succeeded",
      envelope: invalidEnvelope,
    });

    expect(next.current).toEqual(state.current);
    expect(next.baseline).toEqual(state.baseline);
    expect(next.validationErrors).toContainEqual({
      path: "household_name",
      message: "Required string cannot be blank",
    });
  });

  it("is dirty after an edit", () => {
    const state = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Dirty Household",
    });

    expect(selectHasUnsavedChanges(state)).toBe(true);
    expect(shouldRegisterBeforeUnload(state)).toBe(true);
  });

  it("beforeunload handler prevents unload and sets returnValue when dirty", () => {
    const state = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Dirty Household",
    });
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;

    const handler = createBeforeUnloadHandler(state);

    expect(handler).not.toBeNull();
    handler?.(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.returnValue).toBe("");
  });

  it("skips beforeunload handler when clean", () => {
    const state = createInitialHouseholdState(envelope());

    expect(createBeforeUnloadHandler(state)).toBeNull();
  });

  it("is clean after saving updates baseline", () => {
    const dirty = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Saved Household",
    });
    const saved = householdReducer(dirty, {
      type: "save_baseline_updated",
      envelope: dirty.current,
    });

    expect(selectHasUnsavedChanges(saved)).toBe(false);
    expect(shouldRegisterBeforeUnload(saved)).toBe(false);
  });

  it("preserves current and baseline when raw save baseline replacement is invalid", () => {
    const dirty = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Dirty Household",
    });
    const invalidEnvelope = {
      ...dirty.current,
      snapshots: [
        ...dirty.current.snapshots,
        snapshot({ id: "duplicate-date", date: "2026-01-01" }),
      ],
    };

    const next = householdReducer(dirty, {
      type: "save_baseline_updated",
      envelope: invalidEnvelope,
    });

    expect(next.current).toEqual(dirty.current);
    expect(next.baseline).toEqual(dirty.baseline);
    expect(next.validationErrors).toContainEqual({
      path: "snapshots.1.date",
      message: "Duplicate snapshot date also used by snapshots.0.date",
    });
  });
});

describe("file state actions", () => {
  it("replaces state on valid import", () => {
    const state = createInitialHouseholdState(envelope());
    const importedEnvelope = {
      ...envelope(),
      household_name: "Imported Household",
      revision: 4,
    };
    const next = householdReducer(state, {
      type: "import_requested",
      json: JSON.stringify(importedEnvelope),
    });

    expect(next.current.household_name).toBe("Imported Household");
    expect(next.baseline).toEqual(next.current);
    expect(next.validationErrors).toEqual([]);
  });

  it("preserves current state and exposes validation errors on invalid import", () => {
    const state = createInitialHouseholdState(envelope());
    const next = householdReducer(state, {
      type: "import_requested",
      json: JSON.stringify({ ...envelope(), unknown: true }),
    });

    expect(next.current).toEqual(state.current);
    expect(next.baseline).toEqual(state.baseline);
    expect(next.validationErrors).toContainEqual({
      path: "unknown",
      message: "Unrecognized field 'unknown'",
    });
  });

  it.each([
    {
      name: "malformed JSON",
      json: "{not valid json",
      expectedPath: "",
    },
    {
      name: "unknown field",
      json: JSON.stringify({ ...envelope(), unknown: true }),
      expectedPath: "unknown",
    },
    {
      name: "duplicate snapshot date",
      json: JSON.stringify({
        ...envelope(),
        snapshots: [
          ...envelope().snapshots,
          snapshot({ id: "duplicate-date", date: "2026-01-01" }),
        ],
      }),
      expectedPath: "snapshots.1.date",
    },
    {
      name: "missing required field",
      json: JSON.stringify(withoutRequiredProfile(envelope())),
      expectedPath: "profile",
    },
  ])(
    "preserves current state and exposes field-path errors for $name imports",
    ({ json, expectedPath }) => {
      const state = createInitialHouseholdState(envelope());
      const next = householdReducer(state, {
        type: "import_requested",
        json,
      });

      expect(next.current).toEqual(state.current);
      expect(next.baseline).toEqual(state.baseline);
      expect(next.validationErrors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: expectedPath })]),
      );
    },
  );

  it("prepares export payload and advances saved baseline", () => {
    const dirty = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Exported Household",
    });
    const savedAt = new Date("2026-05-27T12:00:00.000Z");
    const result = prepareHouseholdExport(dirty, { savedAt });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("expected export success");
    }
    expect(result.download.filename).toBe(
      "fire-exported-household-2026-05-27T12:00:00.000Z-r2.json",
    );
    expect(JSON.parse(result.download.json)).toMatchObject({
      household_name: "Exported Household",
      revision: 2,
      saved_at: "2026-05-27T12:00:00.000Z",
    });
    expect(result.state.baseline).toEqual(result.state.current);
    expect(selectHasUnsavedChanges(result.state)).toBe(false);
  });

  it("preserves durable data across export and import except revision and saved_at", () => {
    const dirty = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Round Trip Household",
    });
    const savedAt = new Date("2026-05-27T12:00:00.000Z");
    const exported = prepareHouseholdExport(dirty, { savedAt });

    expect(exported.success).toBe(true);
    if (!exported.success) {
      throw new Error("expected export success");
    }

    const imported = householdReducer(createInitialHouseholdState(envelope()), {
      type: "import_requested",
      json: exported.download.json,
    });

    expect(stripVolatileFileFields(imported.current)).toEqual(
      stripVolatileFileFields(dirty.current),
    );
    expect(imported.current.revision).toBe(dirty.current.revision + 1);
    expect(imported.current.saved_at).toBe("2026-05-27T12:00:00.000Z");
    expect(imported.baseline).toEqual(imported.current);
    expect(selectHasUnsavedChanges(imported)).toBe(false);
  });

  it("does not export or advance baseline when current state is invalid", () => {
    const state = createInitialHouseholdState({
      ...envelope(),
      accounts: [
        account({ id: "tfsa", name: "TFSA" }),
        account({ id: "tfsa", name: "Duplicate TFSA" }),
      ],
    });

    const result = prepareHouseholdExport(state, {
      savedAt: new Date("2026-05-27T12:00:00.000Z"),
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected export failure");
    }
    expect(result.state.current).toEqual(state.current);
    expect(result.state.baseline).toEqual(state.baseline);
    expect(result.state.validationErrors).toContainEqual({
      path: "accounts.1.id",
      message: "Duplicate account id also used at index 0",
    });
  });

  it("adds an owner to the household", () => {
    const state = createInitialHouseholdState(envelope());
    const newOwner: Owner = {
      id: "owner-2",
      name: "Spouse",
      birth_year: 1992,
      retirement_age: 58,
    };

    const next = householdReducer(state, { type: "owner_added", owner: newOwner });

    expect(next.current.owners).toHaveLength(2);
    expect(next.current.owners![1]).toEqual(newOwner);
  });

  it("updates an owner's fields", () => {
    const state = createInitialHouseholdState(envelope());

    const next = householdReducer(state, {
      type: "owner_updated",
      ownerId: "owner-1",
      patch: { name: "Alex Updated", retirement_age: 50 },
    });

    expect(next.current.owners![0]!.name).toBe("Alex Updated");
    expect(next.current.owners![0]!.retirement_age).toBe(50);
    expect(next.current.owners![0]!.birth_year).toBe(1990);
  });

  it("removes an owner when more than one exists", () => {
    const twoOwners = envelope();
    twoOwners.owners = [
      { id: "owner-1", name: "Alex", birth_year: 1990, retirement_age: 55 },
      { id: "owner-2", name: "Spouse", birth_year: 1992, retirement_age: 58 },
    ];
    const state = createInitialHouseholdState(twoOwners);

    const next = householdReducer(state, {
      type: "owner_removed",
      ownerId: "owner-2",
    });

    expect(next.current.owners).toHaveLength(1);
    expect(next.current.owners![0]!.id).toBe("owner-1");
  });

  it("does not remove the last owner", () => {
    const state = createInitialHouseholdState(envelope());

    const next = householdReducer(state, {
      type: "owner_removed",
      ownerId: "owner-1",
    });

    expect(next.current.owners).toHaveLength(1);
  });

  it("resets to a fresh household template", () => {
    const dirty = householdReducer(createInitialHouseholdState(envelope()), {
      type: "household_name_updated",
      householdName: "Dirty Household",
    });
    const reset = householdReducer(dirty, { type: "reset_requested" });

    expect(reset.current).toMatchObject({
      revision: 0,
      household_name: "New Household",
      accounts: [],
      snapshots: [],
    });
    expect(reset.baseline).toEqual(reset.current);
  });
});
