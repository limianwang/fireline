import { useState, type ReactNode } from "react";

import type { Owner, WithdrawalInput } from "../domain";
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
  const { profile, assumptions } = state.current;
  const owners = state.current.owners ?? [];

  const updateWithdrawalMode = (kind: WithdrawalInput["kind"]) => {
    if (assumptions.withdrawal_input.kind === kind) {
      return;
    }

    dispatch({
      type: "assumptions_updated",
      patch: {
        withdrawal_input:
          kind === "rate"
            ? { kind, value: 0.04 }
            : {
                kind,
                value:
                  assumptions.annual_expenses > 0
                    ? assumptions.annual_expenses
                    : 100000,
              },
      },
    });
  };

  const updateWithdrawalValue = (value: number) => {
    dispatch({
      type: "assumptions_updated",
      patch: {
        withdrawal_input: {
          ...assumptions.withdrawal_input,
          value,
        },
      },
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
              birth_year: profile.birth_year,
              retirement_age: profile.retirement_age,
            },
          })
        }
        onUpdate={(ownerId, patch) =>
          dispatch({ type: "owner_updated", ownerId, patch })
        }
        onRemove={(ownerId) => dispatch({ type: "owner_removed", ownerId })}
      />

      <div className="assumptions-strip">
        <InlineField label="Birth year">
          <InlineEditable
            label="birth year"
            value={String(profile.birth_year)}
            displayValue={String(profile.birth_year)}
            inputMode="numeric"
            parse={(value) => parseIntegerInput(value, { min: 1900, max: 2100 })}
            onCommit={(birthYear) =>
              dispatch({ type: "profile_updated", patch: { birth_year: birthYear } })
            }
          />
        </InlineField>

        <InlineField label="Retire age">
          <InlineEditable
            label="retirement age"
            value={String(profile.retirement_age)}
            displayValue={String(profile.retirement_age)}
            inputMode="numeric"
            parse={(value) =>
              parseRetirementAge(value, assumptions.projection_end_age)
            }
            onCommit={(retirementAge) =>
              dispatch({
                type: "profile_updated",
                patch: { retirement_age: retirementAge },
              })
            }
          />
        </InlineField>

        <InlineField label="End age">
          <InlineEditable
            label="projection end age"
            value={String(assumptions.projection_end_age)}
            displayValue={String(assumptions.projection_end_age)}
            inputMode="numeric"
            parse={(value) => parseProjectionEndAge(value, profile.retirement_age)}
            onCommit={(projectionEndAge) =>
              dispatch({
                type: "assumptions_updated",
                patch: { projection_end_age: projectionEndAge },
              })
            }
          />
        </InlineField>

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
            <div className="withdrawal-mode-control" aria-label="Withdrawal mode">
              <button
                type="button"
                aria-pressed={assumptions.withdrawal_input.kind === "rate"}
                onClick={() => updateWithdrawalMode("rate")}
              >
                Rate
              </button>
              <button
                type="button"
                aria-pressed={
                  assumptions.withdrawal_input.kind === "fixed_annual_withdrawal"
                }
                onClick={() => updateWithdrawalMode("fixed_annual_withdrawal")}
              >
                Fixed
              </button>
            </div>
            <div className="withdrawal-value-row">
              <InlineEditable
                label="withdrawal value"
                value={withdrawalInputValue(assumptions.withdrawal_input)}
                displayValue={formatWithdrawalInput(assumptions.withdrawal_input)}
                inputMode="decimal"
                parse={(value) =>
                  assumptions.withdrawal_input.kind === "rate"
                    ? parsePositivePercent(value)
                    : parsePositiveMoney(value)
                }
                onCommit={updateWithdrawalValue}
              />
              <span className="withdrawal-unit">
                {assumptions.withdrawal_input.kind === "rate"
                  ? "of annual expenses"
                  : "per year"}
              </span>
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
}: {
  owners: Owner[];
  onAdd: () => void;
  onUpdate: (ownerId: string, patch: Partial<Owner>) => void;
  onRemove: (ownerId: string) => void;
}) {
  return (
    <div className="owners-panel">
      {owners.map((owner) => (
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
                parse={(v) => parseIntegerInput(v, { min: 1, max: 120 })}
                onCommit={(retirement_age) => onUpdate(owner.id, { retirement_age })}
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
      ))}
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

const parsePositiveMoney = (value: string): FieldParseResult => {
  const result = parseMoneyInput(value);
  if (!result.success) {
    return result;
  }

  if (result.value <= 0) {
    return {
      success: false,
      message: "Enter a dollar amount greater than 0.",
    };
  }

  return result;
};

const withdrawalInputValue = (withdrawalInput: WithdrawalInput): string =>
  withdrawalInput.kind === "rate"
    ? formatPercent(withdrawalInput.value)
    : String(withdrawalInput.value);

const formatWithdrawalInput = (withdrawalInput: WithdrawalInput): string =>
  withdrawalInput.kind === "rate"
    ? formatPercent(withdrawalInput.value)
    : formatMoney(withdrawalInput.value);
