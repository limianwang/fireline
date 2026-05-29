import { useMemo, useState, type FormEvent } from "react";

import type {
  AccountBalance,
  FireEnvelope,
  Snapshot,
} from "../domain/types";
import {
  hasDuplicateSnapshotDate,
  selectEngineViewModel,
  selectSnapshotBalancePrefill,
  selectSnapshotRows,
  useHouseholdStore,
  type SnapshotRow,
} from "../state";
import { formatMoney, formatPercent, parseMoneyInput } from "./fieldFormat";

type SnapshotDraft = {
  date: string;
  label: string;
  notes: string;
  accountBalances: AccountBalance[];
};

export function SnapshotsSection() {
  const { state, dispatch } = useHouseholdStore();
  const [showAll, setShowAll] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingSnapshotId, setEditingSnapshotId] = useState<string | null>(null);
  const [deleteSnapshotId, setDeleteSnapshotId] = useState<string | null>(null);
  const rows = selectSnapshotRows(state.current, {
    limit: showAll ? "all" : 6,
  });
  const viewModel = selectEngineViewModel(state);
  const hiddenCount = Math.max(0, state.current.snapshots.length - 6);

  return (
    <section className="quant-section" aria-labelledby="snapshots-title">
      <div className="section-title-row">
        <h2 id="snapshots-title">3. Snapshots</h2>
        <div className="header-actions">
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="button"
              onClick={() => setShowAll((current) => !current)}
            >
              {showAll ? "Show latest 6" : `Show all (${state.current.snapshots.length})`}
            </button>
          ) : null}
          <button
            type="button"
            className="button button-primary"
            onClick={() => setIsCreating(true)}
          >
            New snapshot
          </button>
        </div>
      </div>

      {isCreating ? (
        <SnapshotEditor
          title="New snapshot"
          draft={createNewSnapshotDraft(state.current)}
          onCancel={() => setIsCreating(false)}
          onSave={(draft, setError) => {
            if (hasDuplicateSnapshotDate(state.current, draft.date)) {
              setError("A snapshot already exists for this date.");
              return;
            }

            dispatch({
              type: "snapshot_added",
              snapshot: {
                id: createId(`snapshot-${draft.date}`),
                date: draft.date,
                label: blankToUndefined(draft.label),
                notes: blankToUndefined(draft.notes),
                account_balances: draft.accountBalances,
              },
            });
            setIsCreating(false);
          }}
        />
      ) : null}

      <div className="table-scroll">
        <table className="quant-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Net worth</th>
              <th>Projected assets</th>
              <th>balance change</th>
              <th>Label / notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editingSnapshotId === row.snapshot.id ? (
                <tr key={row.snapshot.id} className="editor-row">
                  <td colSpan={6}>
                    <SnapshotEditor
                      title={`Edit ${row.snapshot.date}`}
                      draft={createEditSnapshotDraft(row.snapshot)}
                      onCancel={() => setEditingSnapshotId(null)}
                      onSave={(draft, setError) => {
                        if (
                          hasDuplicateSnapshotDate(
                            state.current,
                            draft.date,
                            row.snapshot.id,
                          )
                        ) {
                          setError("A snapshot already exists for this date.");
                          return;
                        }

                        dispatch({
                          type: "snapshot_updated",
                          snapshotId: row.snapshot.id,
                          patch: {
                            date: draft.date,
                            label: blankToUndefined(draft.label),
                            notes: blankToUndefined(draft.notes),
                            account_balances: draft.accountBalances,
                          },
                        });
                        setEditingSnapshotId(null);
                      }}
                    />
                  </td>
                </tr>
              ) : (
                <SnapshotDisplayRow
                  key={row.snapshot.id}
                  row={row}
                  isConfirmingDelete={deleteSnapshotId === row.snapshot.id}
                  onEdit={() => setEditingSnapshotId(row.snapshot.id)}
                  onDeleteRequest={() => setDeleteSnapshotId(row.snapshot.id)}
                  onDeleteCancel={() => setDeleteSnapshotId(null)}
                  onDeleteConfirm={() => {
                    dispatch({
                      type: "snapshot_deleted",
                      snapshotId: row.snapshot.id,
                    });
                    setDeleteSnapshotId(null);
                  }}
                />
              ),
            )}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty-cell">
                  No snapshots yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <BalanceChangeDetail
        accounts={state.current.accounts}
        balanceChanges={viewModel.balance_changes}
      />
    </section>
  );
}

function BalanceChangeDetail({
  accounts,
  balanceChanges,
}: {
  accounts: FireEnvelope["accounts"];
  balanceChanges: ReturnType<typeof selectEngineViewModel>["balance_changes"];
}) {
  if (balanceChanges.accounts.length === 0 && !balanceChanges.blended_delta) {
    return null;
  }

  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <div className="balance-change-detail" aria-label="Latest snapshot balance change">
      <div className="balance-change-detail-header">
        <strong>Latest snapshot balance change</strong>
        <span>balance change, not annualized return</span>
      </div>
      <div className="balance-change-detail-grid">
        {balanceChanges.accounts.map((change) => {
          const accountName =
            accountsById.get(change.account_id)?.name ?? change.account_id;
          return (
            <div key={change.account_id} className="balance-change-chip">
              {formatAccountBalanceChange(accountName, change)}
            </div>
          );
        })}
        {balanceChanges.blended_delta ? (
          <div className="balance-change-chip balance-change-chip-primary">
            Blended projected-asset change{" "}
            {formatSignedMoney(balanceChanges.blended_delta.dollar_delta)}
            {formatOptionalPercent(balanceChanges.blended_delta.percent_delta)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SnapshotDisplayRow({
  row,
  isConfirmingDelete,
  onEdit,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: {
  row: SnapshotRow;
  isConfirmingDelete: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <tr className={row.isLatest ? "latest-row" : undefined}>
      <td>
        <strong>{row.snapshot.date}</strong>
        {row.isLatest ? <span className="row-badge">latest</span> : null}
      </td>
      <td className="numeric-cell">{formatMoney(row.netWorth)}</td>
      <td className="numeric-cell">{formatMoney(row.investableAssets)}</td>
      <td className="numeric-cell">{formatBalanceChange(row.balanceChange)}</td>
      <td>
        <div className="muted-stack">
          <span>{row.snapshot.label ?? "Unlabeled"}</span>
          {row.snapshot.notes ? <small>{row.snapshot.notes}</small> : null}
        </div>
      </td>
      <td>
        {isConfirmingDelete ? (
          <div className="action-cluster">
            <button
              type="button"
              className="button button-danger"
              onClick={onDeleteConfirm}
            >
              Confirm delete
            </button>
            <button type="button" className="button" onClick={onDeleteCancel}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="action-cluster">
            <button type="button" className="button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={onDeleteRequest}
            >
              Delete
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function SnapshotEditor({
  title,
  draft: initialDraft,
  onCancel,
  onSave,
}: {
  title: string;
  draft: SnapshotDraft;
  onCancel: () => void;
  onSave: (
    draft: SnapshotDraft,
    setError: (message: string | null) => void,
  ) => void;
}) {
  const { state } = useHouseholdStore();
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const accountById = useMemo(
    () => new Map(state.current.accounts.map((account) => [account.id, account])),
    [state.current.accounts],
  );

  const save = (event: FormEvent) => {
    event.preventDefault();

    if (!draft.date) {
      setError("Date is required.");
      return;
    }

    onSave(draft, setError);
  };

  return (
    <form className="snapshot-editor" onSubmit={save}>
      <div className="editor-header">
        <strong>{title}</strong>
        {error ? (
          <span className="field-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      <div className="snapshot-meta-row">
        <label className="form-field">
          <span className="form-label">Date</span>
          <input
            aria-label={`${title} date`}
            className="table-input snapshot-date-input"
            type="date"
            value={draft.date}
            onChange={(event) =>
              setDraft((current) => ({ ...current, date: event.target.value }))
            }
          />
        </label>
        <label className="form-field form-field-grow">
          <span className="form-label">
            Label <span className="form-label-opt">optional</span>
          </span>
          <input
            aria-label={`${title} label`}
            className="table-input"
            placeholder="e.g. Q1 rebalance"
            value={draft.label}
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
            }
          />
        </label>
        <label className="form-field form-field-grow">
          <span className="form-label">
            Notes <span className="form-label-opt">optional</span>
          </span>
          <input
            aria-label={`${title} notes`}
            className="table-input"
            placeholder="Additional context"
            value={draft.notes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
          />
        </label>
      </div>
      {draft.accountBalances.length > 0 ? (
        <span className="form-label balance-section-label">Account balances</span>
      ) : null}
      <div className="balance-grid">
        {draft.accountBalances.map((balance) => {
          const account = accountById.get(balance.account_id);
          return (
            <label key={balance.account_id} className="balance-field">
              <span className="balance-field-name">
                {account?.name ?? balance.account_id}
                {account?.archived ? " (archived)" : ""}
              </span>
              <div className="amount-row">
                <span className="field-prefix" aria-hidden="true">$</span>
                <input
                  aria-label={`${account?.name ?? balance.account_id} snapshot balance`}
                  className="table-input numeric-input"
                  value={String(balance.balance)}
                  onChange={(event) => {
                    const result = parseMoneyInput(event.target.value);
                    if (!result.success) {
                      return;
                    }
                    setDraft((current) => ({
                      ...current,
                      accountBalances: current.accountBalances.map((item) =>
                        item.account_id === balance.account_id
                          ? { ...item, balance: result.value }
                          : item,
                      ),
                    }));
                  }}
                />
              </div>
            </label>
          );
        })}
      </div>
      <div className="action-cluster">
        <button type="submit" className="button button-primary">
          Save snapshot
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

const createNewSnapshotDraft = (envelope: FireEnvelope): SnapshotDraft => ({
  date: todayLocalDate(),
  label: "",
  notes: "",
  accountBalances: selectSnapshotBalancePrefill(envelope),
});

const createEditSnapshotDraft = (snapshot: Snapshot): SnapshotDraft => ({
  date: snapshot.date,
  label: snapshot.label ?? "",
  notes: snapshot.notes ?? "",
  accountBalances: snapshot.account_balances.map((balance) => ({ ...balance })),
});

const formatBalanceChange = (
  change: SnapshotRow["balanceChange"],
): string => {
  if (!change) {
    return "—";
  }

  const sign = change.dollarDelta > 0 ? "+" : "";
  const percent =
    change.percentDelta !== undefined
      ? ` (${sign}${formatPercent(change.percentDelta)})`
      : "";
  return `${sign}${formatMoney(change.dollarDelta)}${percent}`;
};

const formatAccountBalanceChange = (
  accountName: string,
  change: ReturnType<typeof selectEngineViewModel>["balance_changes"]["accounts"][number],
): string => {
  if (change.label === "new") {
    return `${accountName} new balance ${formatMoney(change.latest_balance)}`;
  }

  return `${accountName} balance change ${formatSignedMoney(change.dollar_delta)}${formatOptionalPercent(change.percent_delta)}`;
};

const formatSignedMoney = (value: number): string =>
  `${value > 0 ? "+" : ""}${formatMoney(value)}`;

const formatOptionalPercent = (value: number | undefined): string =>
  value === undefined ? "" : ` (${formatSignedPercent(value)})`;

const formatSignedPercent = (value: number): string => {
  const sign = value > 0 ? "+" : "";
  const percent = new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value * 100);
  return `${sign}${percent}%`;
};

const todayLocalDate = (): string => toLocalDateInputValue(new Date());

export const toLocalDateInputValue = (
  date: Pick<Date, "getFullYear" | "getMonth" | "getDate">,
): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const blankToUndefined = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const createId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
