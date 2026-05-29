import type {
  Account,
  FireEnvelope,
  HouseholdAssumptions,
  HouseholdProfile,
  Owner,
  Snapshot,
} from "../domain/types";

export type HouseholdAction =
  | { type: "household_name_updated"; householdName: string }
  | { type: "profile_updated"; patch: Partial<HouseholdProfile> }
  | { type: "assumptions_updated"; patch: Partial<HouseholdAssumptions> }
  | { type: "owner_added"; owner: Owner }
  | { type: "owner_updated"; ownerId: string; patch: Partial<Owner> }
  | { type: "owner_removed"; ownerId: string }
  | { type: "account_added"; account: Account }
  | { type: "account_updated"; accountId: string; patch: Partial<Account> }
  | { type: "account_archived"; accountId: string }
  | { type: "account_deleted_if_unreferenced"; accountId: string }
  | { type: "snapshot_added"; snapshot: Snapshot }
  | { type: "snapshot_updated"; snapshotId: string; patch: Partial<Snapshot> }
  | { type: "snapshot_deleted"; snapshotId: string }
  | { type: "import_requested"; json: string }
  | { type: "import_succeeded"; envelope: FireEnvelope }
  | { type: "save_baseline_updated"; envelope: FireEnvelope }
  | { type: "reset_requested" };
