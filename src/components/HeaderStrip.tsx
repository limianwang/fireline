import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  clearLocalHousehold,
  prepareHouseholdExport,
  saveLocalHousehold,
  useHouseholdStore,
} from "../state";
import {
  formatValidationErrors,
  parseFireJson,
  type FireValidationError,
} from "../domain";
import { selectHasUnsavedChanges } from "../state/selectors";
import { formatTimestamp } from "./fieldFormat";

export function HeaderStrip() {
  const { state, dispatch } = useHouseholdStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const skipNameBlurCommitRef = useRef(false);
  const [saveErrors, setSaveErrors] = useState<FireValidationError[]>([]);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const [householdNameDraft, setHouseholdNameDraft] = useState(
    state.current.household_name,
  );
  const [householdNameError, setHouseholdNameError] = useState<string | null>(null);
  const isDirty = selectHasUnsavedChanges(state);
  const validationErrors =
    saveErrors.length > 0 ? saveErrors : state.validationErrors;

  useEffect(() => {
    setHouseholdNameDraft(state.current.household_name);
  }, [state.current.household_name]);

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setSaveErrors([]);
      const result = parseFireJson(await file.text());
      if (!result.success) {
        setSaveErrors(formatValidationErrors(result.error));
        return;
      }

      saveLocalHousehold(result.data);
      dispatch({ type: "import_succeeded", envelope: result.data });
    } catch {
      setSaveErrors([
        {
          path: "file",
          message: "Could not read file.",
        },
      ]);
    } finally {
      event.target.value = "";
    }
  };

  const handleSave = () => {
    const result = prepareHouseholdExport(state);
    if (!result.success) {
      setSaveErrors(result.validationErrors);
      return;
    }

    try {
      if (!saveLocalHousehold(result.download.envelope)) {
        throw new Error("Local storage unavailable");
      }
    } catch {
      setSaveErrors([
        {
          path: "browser",
          message: "Could not save to this browser.",
        },
      ]);
      return;
    }

    setSaveErrors([]);
    dispatch({ type: "save_baseline_updated", envelope: result.download.envelope });
  };

  const handleExport = () => {
    const result = prepareHouseholdExport(state);
    if (!result.success) {
      setSaveErrors(result.validationErrors);
      return;
    }

    setSaveErrors([]);
    triggerJsonDownload(result.download.filename, result.download.json);
    dispatch({ type: "save_baseline_updated", envelope: result.download.envelope });
  };

  const commitHouseholdName = () => {
    if (skipNameBlurCommitRef.current) {
      skipNameBlurCommitRef.current = false;
      return;
    }

    const trimmedName = householdNameDraft.trim();
    if (!trimmedName) {
      setHouseholdNameDraft(state.current.household_name);
      setHouseholdNameError("Household name is required.");
      return;
    }

    setHouseholdNameError(null);
    dispatch({
      type: "household_name_updated",
      householdName: trimmedName,
    });
  };

  const handleReset = () => {
    setSaveErrors([]);
    clearLocalHousehold();
    dispatch({ type: "reset_requested" });
    setIsResetConfirming(false);
  };

  return (
    <header className="header-strip" aria-label="Household file controls">
      <div className="header-strip-row">
        <div className="header-identity">
          <label className="household-name-field">
            <span className="sr-only">Household name</span>
            <input
              className={
                householdNameError
                  ? "household-name-input household-name-input-error"
                  : "household-name-input"
              }
              aria-invalid={householdNameError ? "true" : "false"}
              value={householdNameDraft}
              onBlur={commitHouseholdName}
              onChange={(event) => {
                setHouseholdNameDraft(event.target.value);
                setHouseholdNameError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  skipNameBlurCommitRef.current = true;
                  setHouseholdNameDraft(state.current.household_name);
                  setHouseholdNameError(null);
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          {householdNameError ? (
            <span className="field-error" role="alert">
              {householdNameError}
            </span>
          ) : null}
          <span className="revision-badge">r{state.current.revision}</span>
          <span className="saved-at">
            saved {formatTimestamp(state.current.saved_at)}
          </span>
        </div>

        <div className="header-actions">
          <input
            ref={fileInputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
          />
          <button
            type="button"
            className="button button-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            Import JSON
          </button>
          <button type="button" className="button button-primary" onClick={handleSave}>
            Save{isDirty ? "*" : ""}
          </button>
          <button type="button" className="button button-secondary" onClick={handleExport}>
            Export JSON
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setIsResetConfirming(true)}
          >
            Reset
          </button>
        </div>
      </div>

      {isResetConfirming ? (
        <div className="inline-confirm" role="group" aria-label="Confirm reset">
          <span>Discard current in-memory household and start fresh?</span>
          <button type="button" className="button button-danger" onClick={handleReset}>
            Yes, reset
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setIsResetConfirming(false)}
          >
            No
          </button>
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <ValidationBanner errors={validationErrors} />
      ) : null}

      {isDirty ? (
        <div className="dirty-state-bar" role="status">
          <strong>!</strong>
          {" "}
          <span>
            Unsaved changes. Save stores them in this browser. Export JSON
            downloads a file backup.
          </span>
        </div>
      ) : (
        <div className="clean-state-bar" role="status">
          <strong>OK</strong>
          {" "}
          <span>
            Saved in this browser until Reset or browser site data is cleared.
            Export JSON downloads a portable copy.
          </span>
        </div>
      )}
    </header>
  );
}

function ValidationBanner({ errors }: { errors: FireValidationError[] }) {
  return (
    <div className="validation-banner" role="alert">
      <strong>Validation error</strong>
      <ul>
        {errors.map((error) => (
          <li key={`${error.path}:${error.message}`}>
            <code>{error.path || "file"}</code>
            <span>{error.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const triggerJsonDownload = (filename: string, json: string): void => {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
