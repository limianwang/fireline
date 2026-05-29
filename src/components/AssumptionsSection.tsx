import { useState, type ReactNode } from "react";

import type { Owner } from "../domain";
import { useHouseholdStore } from "../state";
import { InlineEditable } from "./InlineEditable";
import {
  formatMoney,
  formatPercent,
  parseIntegerInput,
  parseMoneyInput,
  parsePercentInput,
  type FieldParseResult,
} from "./fieldFormat";

export type DisplayMode = "real" | "nominal";
export type ContributionMode = "with" | "without";

export function AssumptionsSection({
  displayMode,
  contributionMode,
  onDisplayModeChange,
  onContributionModeChange,
}: {
  displayMode: DisplayMode;
  contributionMode: ContributionMode;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onContributionModeChange: (mode: ContributionMode) => void;
}) {
  const { state, dispatch } = useHouseholdStore();
  const { assumptions } = state.current;
  const owners = state.current.owners ?? [];

  const updateWithdrawalRate = (value: number) => {
    dispatch({
      type: "assumptions_updated",
      patch: { withdrawal_rate: value },
    });
  };

  return (
    <section className="quant-section" aria-labelledby="assumptions-title">
      <div className="section-title-row">
        <h2 id="assumptions-title">1. Assumptions</h2>
        <div className="toggle-cluster" aria-label="Presentation controls">
          <SegmentedControl
            label="Dollar display"
            options={[
              { value: "real", label: "real $" },
              { value: "nominal", label: "nominal $" },
            ]}
            value={displayMode}
            onChange={onDisplayModeChange}
          />
          <SegmentedControl
            label="Projection contributions"
            options={[
              { value: "with", label: "with contributions" },
              { value: "without", label: "without" },
            ]}
            value={contributionMode}
            onChange={onContributionModeChange}
          />
        </div>
      </div>

      <OwnersPanel
        owners={owners}
        onAdd={() =>
          dispatch({
            type: "owner_added",
            owner: {
              id: `owner-${Date.now().toString(36)}`,
              name: "New owner",
              birth_year: owners[0]?.birth_year ?? state.current.profile.birth_year,
              retirement_age:
                owners[0]?.retirement_age ?? state.current.profile.retirement_age,
              projection_end_age: assumptions.projection_end_age,
            },
          })
        }
        onUpdate={(ownerId, patch) =>
          dispatch({ type: "owner_updated", ownerId, patch })
        }
        onRemove={(ownerId) => dispatch({ type: "owner_removed", ownerId })}
        defaultProjectionEndAge={assumptions.projection_end_age}
      />

      <div className="assumptions-strip">
        <InlineField label="Annual expenses">
          <InlineEditable
            label="annual expenses"
            value={String(assumptions.annual_expenses)}
            displayValue={formatMoney(assumptions.annual_expenses)}
            inputMode="decimal"
            parse={parseMoneyInput}
            onCommit={(annualExpenses) =>
              dispatch({
                type: "assumptions_updated",
                patch: { annual_expenses: annualExpenses },
              })
            }
          />
        </InlineField>

        <InlineField label="Withdrawal">
          <div className="withdrawal-editor">
            <div className="withdrawal-value-row">
              <InlineEditable
                label="withdrawal rate"
                value={formatPercent(assumptions.withdrawal_rate)}
                displayValue={formatPercent(assumptions.withdrawal_rate)}
                inputMode="decimal"
                parse={parsePositivePercent}
                onCommit={updateWithdrawalRate}
              />
              <span className="withdrawal-unit">of annual expenses</span>
            </div>
          </div>
        </InlineField>

        <InlineField label="Inflation">
          <InlineEditable
            label="inflation rate"
            value={formatPercent(assumptions.inflation_rate)}
            displayValue={formatPercent(assumptions.inflation_rate)}
            inputMode="decimal"
            parse={parseInflationRate}
            onCommit={(inflationRate) =>
              dispatch({
                type: "assumptions_updated",
                patch: { inflation_rate: inflationRate },
              })
            }
          />
        </InlineField>

        <InlineField label="Barista income">
          <InlineEditable
            label="barista income"
            value={String(assumptions.barista_combined_income)}
            displayValue={formatMoney(assumptions.barista_combined_income)}
            inputMode="decimal"
            parse={parseMoneyInput}
            onCommit={(baristaCombinedIncome) =>
              dispatch({
                type: "assumptions_updated",
                patch: { barista_combined_income: baristaCombinedIncome },
              })
            }
          />
        </InlineField>
      </div>
    </section>
  );
}

function InlineField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="assumption-field">
      <span className="assumption-label">{label}</span>
      {children}
    </div>
  );
}

function OwnerNameField({
  name,
  onCommit,
}: {
  name: string;
  onCommit: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  if (editing) {
    return (
      <input
        aria-label="Owner name"
        className="inline-edit-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed && trimmed !== name) onCommit(trimmed);
          else setDraft(name);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(name); setEditing(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="inline-edit-value"
      style={{ fontFamily: "inherit" }}
      onClick={() => { setDraft(name); setEditing(true); }}
    >
      {name}
    </button>
  );
}

function OwnersPanel({
  owners,
  onAdd,
  onUpdate,
  onRemove,
  defaultProjectionEndAge,
}: {
  owners: Owner[];
  onAdd: () => void;
  onUpdate: (ownerId: string, patch: Partial<Owner>) => void;
  onRemove: (ownerId: string) => void;
  defaultProjectionEndAge: number;
}) {
  return (
    <div className="owners-panel">
      {owners.map((owner) => {
        const projectionEndAge =
          owner.projection_end_age ?? defaultProjectionEndAge;

        return (
          <div key={owner.id} className="owner-card">
            <div className="owner-card-fields">
              <div className="owner-field">
                <span className="assumption-label">Name</span>
                <OwnerNameField
                  name={owner.name}
                  onCommit={(name) => onUpdate(owner.id, { name })}
                />
              </div>
              <div className="owner-field">
                <span className="assumption-label">Birth year</span>
                <InlineEditable
                  label={`${owner.name} birth year`}
                  value={String(owner.birth_year)}
                  displayValue={String(owner.birth_year)}
                  inputMode="numeric"
                  parse={(v) => parseIntegerInput(v, { min: 1900, max: 2100 })}
                  onCommit={(birth_year) => onUpdate(owner.id, { birth_year })}
                />
              </div>
              <div className="owner-field">
                <span className="assumption-label">Retire age</span>
                <InlineEditable
                  label={`${owner.name} retirement age`}
                  value={String(owner.retirement_age)}
                  displayValue={String(owner.retirement_age)}
                  inputMode="numeric"
                  parse={(v) => parseRetirementAge(v, projectionEndAge)}
                  onCommit={(retirement_age) =>
                    onUpdate(owner.id, { retirement_age })
                  }
                />
              </div>
              <div className="owner-field">
                <span className="assumption-label">End age</span>
                <InlineEditable
                  label={`${owner.name} projection end age`}
                  value={String(projectionEndAge)}
                  displayValue={String(projectionEndAge)}
                  inputMode="numeric"
                  parse={(v) => parseProjectionEndAge(v, owner.retirement_age)}
                  onCommit={(projection_end_age) =>
                    onUpdate(owner.id, { projection_end_age })
                  }
                />
              </div>
            </div>
            {owners.length > 1 ? (
              <button
                type="button"
                className="owner-remove-btn"
                aria-label={`Remove owner ${owner.id}`}
                onClick={() => onRemove(owner.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
      <button
        type="button"
        className="button"
        style={{ marginTop: 6 }}
        onClick={onAdd}
      >
        Add owner
      </button>
    </div>
  );
}

function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) {
  return (
    <div className="segmented-control" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const parseRetirementAge = (
  value: string,
  projectionEndAge: number,
): FieldParseResult => {
  const result = parseIntegerInput(value, { min: 1, max: 120 });
  if (!result.success) {
    return result;
  }

  if (result.value > projectionEndAge) {
    return {
      success: false,
      message: "Retirement age must be less than or equal to projection end age.",
    };
  }

  return result;
};

const parseProjectionEndAge = (
  value: string,
  retirementAge: number,
): FieldParseResult => {
  const result = parseIntegerInput(value, { min: 1, max: 120 });
  if (!result.success) {
    return result;
  }

  if (result.value < retirementAge) {
    return {
      success: false,
      message: "Projection end age must be greater than or equal to retirement age.",
    };
  }

  return result;
};

const parsePositivePercent = (value: string): FieldParseResult => {
  const result = parsePercentInput(value);
  if (!result.success) {
    return result;
  }

  if (result.value <= 0 || result.value > 1) {
    return {
      success: false,
      message: "Enter a percentage greater than 0 and up to 100%.",
    };
  }

  return result;
};

const parseInflationRate = (value: string): FieldParseResult => {
  const result = parsePercentInput(value);
  if (!result.success) {
    return result;
  }

  if (result.value < -0.99 || result.value > 1) {
    return {
      success: false,
      message: "Enter a percentage from -99% to 100%.",
    };
  }

  return result;
};
