import { useEffect, useState, type FormEvent } from "react";

import type { Account, AccountType } from "../domain/types";
import {
  selectAccountRealReturn,
  selectLatestAccountBalances,
  useHouseholdStore,
} from "../state";
import {
  formatMoney,
  formatPercent,
  parseMoneyInput,
  parsePercentInput,
  type FieldParseResult,
} from "./fieldFormat";

type ContributionMode = "none" | "annual" | "monthly";

const accountTypes: AccountType[] = [
  "tfsa",
  "rrsp",
  "non_registered",
  "cash",
  "other_asset",
];

export function AccountsSection() {
  const { state, dispatch } = useHouseholdStore();
  const [isAdding, setIsAdding] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [contributionModes, setContributionModes] = useState<
    Record<string, ContributionMode>
  >({});
  const [pausedContributions, setPausedContributions] = useState<
    Record<string, number>
  >({});
  const latestBalances = selectLatestAccountBalances(state.current);
  const owners = state.current.owners ?? [];
  const activeAccounts = state.current.accounts.filter((account) => !account.archived);
  const archivedAccounts = state.current.accounts.filter(
    (account) => account.archived,
  );
  const contributionTotal = activeAccounts
    .filter((account) => account.include_in_fire)
    .reduce((total, account) => total + account.annual_contribution, 0);
  const fireBalanceTotal = activeAccounts
    .filter((account) => account.include_in_fire)
    .reduce((total, account) => total + (latestBalances[account.id] ?? 0), 0);

  return (
    <section className="quant-section" aria-labelledby="accounts-title">
      <div className="section-title-row">
        <h2 id="accounts-title">2. Accounts</h2>
        <button
          type="button"
          className="button button-primary"
          onClick={() => setIsAdding(true)}
        >
          Add account
        </button>
      </div>

      <div className="table-scroll">
        <table className="quant-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Return</th>
              <th>Contribution plan</th>
              <th>Latest balance</th>
              <th>Projection</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeAccounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                latestBalance={latestBalances[account.id] ?? 0}
                inflationRate={state.current.assumptions.inflation_rate}
                owners={owners}
                contributionMode={
                  contributionModes[account.id] ??
                  (account.annual_contribution === 0 ? "none" : "annual")
                }
                isDeleteAllowed={!isAccountReferenced(state.current, account.id)}
                onContributionModeChange={(mode) => {
                  if (mode === "none" && account.annual_contribution > 0) {
                    setPausedContributions((current) => ({
                      ...current,
                      [account.id]: account.annual_contribution,
                    }));
                  }
                  setContributionModes((current) => ({
                    ...current,
                    [account.id]: mode,
                  }));
                  if (mode === "none") {
                    dispatch({
                      type: "account_updated",
                      accountId: account.id,
                      patch: { annual_contribution: 0 },
                    });
                    return;
                  }

                  if (account.annual_contribution === 0) {
                    const pausedContribution = pausedContributions[account.id];
                    if (pausedContribution !== undefined) {
                      dispatch({
                        type: "account_updated",
                        accountId: account.id,
                        patch: { annual_contribution: pausedContribution },
                      });
                    }
                  }
                }}
                onUpdate={(patch) =>
                  dispatch({
                    type: "account_updated",
                    accountId: account.id,
                    patch,
                  })
                }
                onArchive={() =>
                  dispatch({ type: "account_archived", accountId: account.id })
                }
                onDelete={() =>
                  dispatch({
                    type: "account_deleted_if_unreferenced",
                    accountId: account.id,
                  })
                }
              />
            ))}
            <tr className="summary-row">
              <td>Projected assets</td>
              <td />
              <td />
              <td />
              <td>{formatMoney(contributionTotal)} / yr</td>
              <td className="numeric-cell">{formatMoney(fireBalanceTotal)}</td>
              <td />
              <td />
            </tr>
            {isAdding ? (
              <NewAccountRow
                owners={owners}
                onCancel={() => setIsAdding(false)}
                onSave={(account) => {
                  dispatch({ type: "account_added", account });
                  setIsAdding(false);
                }}
              />
            ) : null}
          </tbody>
        </table>
      </div>

      {archivedAccounts.length > 0 ? (
        <div className="archived-block">
          <button
            type="button"
            className="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? "Hide" : "Show"} archived accounts (
            {archivedAccounts.length})
          </button>
          {showArchived ? (
            <div className="archived-list">
              {archivedAccounts.map((account) => (
                <span key={account.id} className="archived-item">
                  {account.name}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      dispatch({
                        type: "account_updated",
                        accountId: account.id,
                        patch: { archived: false },
                      })
                    }
                  >
                    Restore
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function AccountRow({
  account,
  latestBalance,
  inflationRate,
  contributionMode,
  isDeleteAllowed,
  owners,
  onContributionModeChange,
  onUpdate,
  onArchive,
  onDelete,
}: {
  account: Account;
  latestBalance: number;
  inflationRate: number;
  contributionMode: ContributionMode;
  isDeleteAllowed: boolean;
  owners: { id: string; name: string }[];
  onContributionModeChange: (mode: ContributionMode) => void;
  onUpdate: (patch: Partial<Account>) => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const contributionValue =
    contributionMode === "none"
      ? 0
      : contributionMode === "monthly"
        ? account.annual_contribution / 12
        : account.annual_contribution;
  const returnWarning =
    account.expected_nominal_return < 0 || account.expected_nominal_return > 0.15;

  return (
    <tr>
      <td>
        <input
          aria-label={`${account.name} account name`}
          className="table-input"
          value={account.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
        />
      </td>
      <td>
        <select
          aria-label={`${account.name} account type`}
          className="table-input"
          value={account.type}
          onChange={(event) =>
            onUpdate({ type: event.target.value as AccountType })
          }
        >
          {accountTypes.map((type) => (
            <option key={type} value={type}>
              {formatAccountType(type)}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          aria-label={`${account.name} account owner`}
          className="table-input unit-select"
          value={account.owner_id ?? ""}
          onChange={(event) =>
            onUpdate({ owner_id: blankToUndefined(event.target.value) })
          }
        >
          <option value="">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className={returnWarning ? "stacked-field warning-field" : "stacked-field"}>
          <NumericDraftInput
            label={`${account.name} nominal return`}
            value={formatPercent(account.expected_nominal_return)}
            parse={parsePercentInput}
            onCommit={(value) => onUpdate({ expected_nominal_return: value })}
          />
          <span>
            real{" "}
            {formatPercent(
              selectAccountRealReturn({
                expectedNominalReturn: account.expected_nominal_return,
                inflationRate,
              }),
            )}
          </span>
        </label>
      </td>
      <td>
        <div className="contribution-control">
          {contributionMode === "none" ? (
            <span className="no-contribution-text">No contribution</span>
          ) : (
            <div className="amount-row">
              <span className="field-prefix" aria-hidden="true">$</span>
              <NumericDraftInput
                label={`${account.name} contribution`}
                value={formatContributionValue(contributionValue)}
                parse={parseMoneyInput}
                onCommit={(value) => {
                  onUpdate({
                    annual_contribution:
                      contributionMode === "monthly" ? value * 12 : value,
                  });
                }}
              />
              <span className="field-unit">
                {contributionMode === "annual" ? "/ yr" : "/ mo"}
              </span>
            </div>
          )}
          <ContributionModeControl
            labelPrefix={account.name}
            value={contributionMode}
            onChange={onContributionModeChange}
          />
        </div>
      </td>
      <td className="numeric-cell">
        <div
          className="readonly-balance"
          title="Latest balance comes from the latest snapshot. Edit it in Snapshots."
          aria-label={`${account.name} latest balance ${formatMoney(latestBalance)} from latest snapshot`}
        >
          <span>{formatMoney(latestBalance)}</span>
          <small>from latest snapshot</small>
        </div>
      </td>
      <td>
        <label
          className="checkbox-label projection-checkbox"
          title={
            account.include_in_fire
              ? "Included in FIRE progress, retirement projection, and lens dates."
              : "Tracked in net worth only; excluded from retirement projection."
          }
        >
          <input
            aria-label={`${account.name} use in retirement projection`}
            type="checkbox"
            checked={account.include_in_fire}
            onChange={(event) =>
              onUpdate({ include_in_fire: event.target.checked })
            }
          />
          <span>{account.include_in_fire ? "Projected" : "Net worth only"}</span>
        </label>
      </td>
      <td>
        <div className="action-cluster">
          <button type="button" className="button" onClick={onArchive}>
            Archive
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={!isDeleteAllowed}
            title={
              isDeleteAllowed
                ? "Delete account"
                : "Cannot delete accounts referenced by snapshots"
            }
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

function NumericDraftInput({
  label,
  value,
  parse,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: string;
  parse: (value: string) => FieldParseResult;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(value);
    }
  }, [isEditing, value]);

  return (
    <input
      aria-label={label}
      className="table-input numeric-input"
      disabled={disabled}
      value={draft}
      onFocus={() => setIsEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setIsEditing(false);
        const result = parse(draft);
        if (result.success) {
          onCommit(result.value);
          setDraft(value);
          return;
        }
        setDraft(value);
      }}
    />
  );
}

function NewAccountRow({
  owners,
  onCancel,
  onSave,
}: {
  owners: { id: string; name: string }[];
  onCancel: () => void;
  onSave: (account: Account) => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    type: "tfsa" as AccountType,
    ownerId: "",
    expectedReturn: "5%",
    contribution: "0",
    contributionMode: "none" as ContributionMode,
    includeInFire: true,
  });
  const [error, setError] = useState<string | null>(null);

  const save = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    const expectedReturn = parsePercentInput(draft.expectedReturn);
    let annualContribution = 0;

    if (!name) {
      setError("Name is required.");
      return;
    }
    if (!expectedReturn.success) {
      setError(expectedReturn.message);
      return;
    }
    if (draft.contributionMode !== "none") {
      const contribution = parseMoneyInput(draft.contribution);
      if (!contribution.success) {
        setError(contribution.message);
        return;
      }
      annualContribution =
        draft.contributionMode === "monthly"
          ? contribution.value * 12
          : contribution.value;
    }

    onSave({
      id: createId("account"),
      name,
      type: draft.type,
      owner_id: blankToUndefined(draft.ownerId),
      expected_nominal_return: expectedReturn.value,
      annual_contribution: annualContribution,
      include_in_fire: draft.includeInFire,
      archived: false,
    });
  };

  return (
    <tr className="editor-row">
      <td colSpan={8}>
        <form className="account-form" onSubmit={save}>
          <div className="account-form-row">
            <label className="form-field form-field-grow">
              <span className="form-label">Account name</span>
              <input
                aria-label="New account name"
                className="table-input"
                placeholder="e.g. TFSA — RBC"
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="form-field">
              <span className="form-label">Type</span>
              <select
                aria-label="New account type"
                className="table-input"
                value={draft.type}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    type: event.target.value as AccountType,
                  }))
                }
              >
                {accountTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatAccountType(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Owner</span>
              <select
                aria-label="New account owner"
                className="table-input unit-select"
                value={draft.ownerId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, ownerId: event.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {owners.map((owner) => (
                  <option key={owner.id} value={owner.id}>
                    {owner.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="form-label">Expected return</span>
              <input
                aria-label="New account nominal return"
                className="table-input numeric-input"
                placeholder="5%"
                value={draft.expectedReturn}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    expectedReturn: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="account-form-row account-form-utility-row">
            <div className="form-field account-contribution-field">
              <span className="form-label">Contribution plan</span>
              <div className="contribution-control new-account-contribution-control">
                {draft.contributionMode === "none" ? (
                  <span className="no-contribution-text no-contribution-pill">
                    No contribution
                  </span>
                ) : (
                  <div className="amount-row">
                    <span className="field-prefix" aria-hidden="true">$</span>
                    <input
                      aria-label="New account contribution"
                      className="table-input numeric-input"
                      value={draft.contribution}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          contribution: event.target.value,
                        }))
                      }
                    />
                    <span className="field-unit">
                      {draft.contributionMode === "annual" ? "/ yr" : "/ mo"}
                    </span>
                  </div>
                )}
                <ContributionModeControl
                  labelPrefix="New account"
                  value={draft.contributionMode}
                  onChange={(mode) =>
                    setDraft((current) => ({
                      ...current,
                      contributionMode: mode,
                    }))
                  }
                />
              </div>
            </div>
            <label className="form-field form-field-checkbox projection-form-checkbox">
              <input
                aria-label="New account use in retirement projection"
                type="checkbox"
                checked={draft.includeInFire}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includeInFire: event.target.checked,
                  }))
                }
              />
              <span className="form-label">Projection</span>
            </label>
          </div>

          <div className="account-form-actions">
            <button type="submit" className="button button-primary">
              Save account
            </button>
            <button type="button" className="button" onClick={onCancel}>
              Cancel
            </button>
            {error ? (
              <span className="field-error" role="alert">
                {error}
              </span>
            ) : null}
          </div>
        </form>
      </td>
    </tr>
  );
}

function ContributionModeControl({
  labelPrefix,
  value,
  onChange,
}: {
  labelPrefix: string;
  value: ContributionMode;
  onChange: (mode: ContributionMode) => void;
}) {
  return (
    <div
      className="mini-segments contribution-mode-control"
      role="group"
      aria-label={`${labelPrefix} contribution mode`}
    >
      <button
        type="button"
        aria-label={`${labelPrefix} no contribution`}
        aria-pressed={value === "none"}
        onClick={() => onChange("none")}
      >
        None
      </button>
      <button
        type="button"
        aria-label={`${labelPrefix} annual contribution`}
        aria-pressed={value === "annual"}
        onClick={() => onChange("annual")}
      >
        Annual
      </button>
      <button
        type="button"
        aria-label={`${labelPrefix} monthly contribution`}
        aria-pressed={value === "monthly"}
        onClick={() => onChange("monthly")}
      >
        Monthly
      </button>
    </div>
  );
}

const isAccountReferenced = (
  envelope: { snapshots: { account_balances: { account_id: string }[] }[] },
  accountId: string,
): boolean =>
  envelope.snapshots.some((snapshot) =>
    snapshot.account_balances.some((balance) => balance.account_id === accountId),
  );

const formatContributionValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const formatAccountType = (type: AccountType): string =>
  type.replace(/_/g, " ").toUpperCase();

const blankToUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const createId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
