import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import {
  createFreshHousehold,
  formatValidationErrors,
  generateFireFilename,
  parseFireJson,
  prepareFireExport,
  validateFireEnvelope,
  type FireValidationError,
} from "../domain";
import type { FireEnvelope } from "../domain/types";
import type { HouseholdAction } from "./actions";
import { selectHasUnsavedChanges } from "./selectors";

export type HouseholdState = {
  current: FireEnvelope;
  baseline: FireEnvelope;
  validationErrors: FireValidationError[];
};

export type HouseholdDownload = {
  filename: string;
  json: string;
  envelope: FireEnvelope;
};

export type PrepareHouseholdExportOptions = {
  savedAt?: Date;
};

export type PrepareHouseholdExportResult =
  | {
      success: true;
      state: HouseholdState;
      download: HouseholdDownload;
    }
  | {
      success: false;
      state: HouseholdState;
      validationErrors: FireValidationError[];
    };

export const createInitialHouseholdState = (
  envelope: FireEnvelope = createFreshHousehold(),
): HouseholdState => ({
  current: envelope,
  baseline: envelope,
  validationErrors: [],
});

export const householdReducer = (
  state: HouseholdState,
  action: HouseholdAction,
): HouseholdState => {
  switch (action.type) {
    case "household_name_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        household_name: action.householdName,
      });

    case "profile_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        profile: {
          ...state.current.profile,
          ...action.patch,
        },
      });

    case "assumptions_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        assumptions: {
          ...state.current.assumptions,
          ...action.patch,
        },
      });

    case "owner_added":
      return updateCurrentIfValid(state, {
        ...state.current,
        owners: [...(state.current.owners ?? []), action.owner],
      });

    case "owner_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        owners: (state.current.owners ?? []).map((owner) =>
          owner.id === action.ownerId
            ? { ...owner, ...action.patch, id: owner.id }
            : owner,
        ),
      });

    case "owner_removed": {
      const owners = state.current.owners ?? [];
      if (owners.length <= 1) return state;
      return updateCurrentIfValid(state, {
        ...state.current,
        owners: owners.filter((owner) => owner.id !== action.ownerId),
      });
    }

    case "account_added":
      return updateCurrentIfValid(state, {
        ...state.current,
        accounts: [...state.current.accounts, action.account],
      });

    case "account_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        accounts: state.current.accounts.map((account) =>
          account.id === action.accountId
            ? { ...account, ...action.patch, id: account.id }
            : account,
        ),
      });

    case "account_archived":
      return updateCurrentIfValid(state, {
        ...state.current,
        accounts: state.current.accounts.map((account) =>
          account.id === action.accountId
            ? { ...account, archived: true }
            : account,
        ),
      });

    case "account_deleted_if_unreferenced":
      if (isAccountReferenced(state.current, action.accountId)) {
        return state;
      }
      return updateCurrentIfValid(state, {
        ...state.current,
        accounts: state.current.accounts.filter(
          (account) => account.id !== action.accountId,
        ),
      });

    case "snapshot_added":
      return updateCurrentIfValid(state, {
        ...state.current,
        snapshots: [...state.current.snapshots, action.snapshot],
      });

    case "snapshot_updated":
      return updateCurrentIfValid(state, {
        ...state.current,
        snapshots: state.current.snapshots.map((snapshot) =>
          snapshot.id === action.snapshotId
            ? { ...snapshot, ...action.patch, id: snapshot.id }
            : snapshot,
        ),
      });

    case "snapshot_deleted":
      return updateCurrentIfValid(state, {
        ...state.current,
        snapshots: state.current.snapshots.filter(
          (snapshot) => snapshot.id !== action.snapshotId,
        ),
      });

    case "import_requested": {
      const result = parseFireJson(action.json);
      if (!result.success) {
        return {
          ...state,
          validationErrors: formatValidationErrors(result.error),
        };
      }
      return replaceCurrentAndBaseline(result.data);
    }

    case "import_succeeded":
      return replaceCurrentAndBaselineIfValid(state, action.envelope);

    case "save_baseline_updated":
      return replaceCurrentAndBaselineIfValid(state, action.envelope);

    case "reset_requested":
      return replaceCurrentAndBaseline(createFreshHousehold());
  }
};

export const prepareHouseholdExport = (
  state: HouseholdState,
  options: PrepareHouseholdExportOptions = {},
): PrepareHouseholdExportResult => {
  const currentResult = validateFireEnvelope(state.current);
  if (!currentResult.success) {
    const validationErrors = formatValidationErrors(currentResult.error);
    return {
      success: false,
      state: {
        ...state,
        validationErrors,
      },
      validationErrors,
    };
  }

  const envelope = prepareFireExport(state.current, options);
  const exportResult = validateFireEnvelope(envelope);
  if (!exportResult.success) {
    const validationErrors = formatValidationErrors(exportResult.error);
    return {
      success: false,
      state: {
        ...state,
        validationErrors,
      },
      validationErrors,
    };
  }

  const filename = generateFireFilename({
    householdName: envelope.household_name,
    savedAtIso: envelope.saved_at,
    revision: envelope.revision,
  });

  return {
    success: true,
    state: replaceCurrentAndBaseline(envelope),
    download: {
      filename,
      json: `${JSON.stringify(envelope, null, 2)}\n`,
      envelope,
    },
  };
};

const HouseholdStateContext = createContext<HouseholdState | null>(null);
const HouseholdDispatchContext = createContext<Dispatch<HouseholdAction> | null>(
  null,
);

export const HouseholdProvider = ({
  children,
  initialEnvelope,
}: {
  children: ReactNode;
  initialEnvelope?: FireEnvelope;
}) => {
  const [state, dispatch] = useReducer(
    householdReducer,
    initialEnvelope,
    createInitialHouseholdState,
  );
  const isDirty = selectHasUnsavedChanges(state);

  useEffect(() => {
    const handleBeforeUnload = createBeforeUnloadHandler(state);
    if (!handleBeforeUnload || typeof window === "undefined") {
      return;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, state]);

  return (
    <HouseholdStateContext.Provider value={state}>
      <HouseholdDispatchContext.Provider value={dispatch}>
        {children}
      </HouseholdDispatchContext.Provider>
    </HouseholdStateContext.Provider>
  );
};

export const useHouseholdState = (): HouseholdState => {
  const state = useContext(HouseholdStateContext);
  if (!state) {
    throw new Error("useHouseholdState must be used within HouseholdProvider");
  }
  return state;
};

export const useHouseholdDispatch = (): Dispatch<HouseholdAction> => {
  const dispatch = useContext(HouseholdDispatchContext);
  if (!dispatch) {
    throw new Error("useHouseholdDispatch must be used within HouseholdProvider");
  }
  return dispatch;
};

export const useHouseholdStore = () => {
  const state = useHouseholdState();
  const dispatch = useHouseholdDispatch();

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
};

export const createBeforeUnloadHandler = (
  state: HouseholdState,
): ((event: BeforeUnloadEvent) => void) | null => {
  if (!selectHasUnsavedChanges(state)) {
    return null;
  }

  return (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = "";
  };
};

const updateCurrentIfValid = (
  state: HouseholdState,
  current: FireEnvelope,
): HouseholdState => {
  const result = validateFireEnvelope(current);
  if (!result.success) {
    return {
      ...state,
      validationErrors: formatValidationErrors(result.error),
    };
  }

  return {
    ...state,
    current,
    validationErrors: [],
  };
};

const replaceCurrentAndBaseline = (envelope: FireEnvelope): HouseholdState => ({
  current: envelope,
  baseline: envelope,
  validationErrors: [],
});

const replaceCurrentAndBaselineIfValid = (
  state: HouseholdState,
  envelope: FireEnvelope,
): HouseholdState => {
  const result = validateFireEnvelope(envelope);
  if (!result.success) {
    return {
      ...state,
      validationErrors: formatValidationErrors(result.error),
    };
  }

  return replaceCurrentAndBaseline(envelope);
};

const isAccountReferenced = (
  envelope: FireEnvelope,
  accountId: string,
): boolean =>
  envelope.snapshots.some((snapshot) =>
    snapshot.account_balances.some(
      (accountBalance) => accountBalance.account_id === accountId,
    ),
  );
