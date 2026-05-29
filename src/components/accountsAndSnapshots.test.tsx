// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { Account, FireEnvelope } from "../domain/types";
import { HouseholdProvider, useHouseholdState } from "../state";
import { AccountsSection } from "./AccountsSection";
import {
  SnapshotsSection,
  toLocalDateInputValue,
} from "./SnapshotsSection";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

describe("SnapshotsSection", () => {
  it("rejects duplicate snapshot dates in the inline new-snapshot editor", async () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <SnapshotsSection />
      </HouseholdProvider>,
    );

    await click(button("New snapshot"));
    await change(textbox("New snapshot date"), "2026-05-01");
    await click(button("Save snapshot"));

    expect(container?.textContent).toContain(
      "A snapshot already exists for this date.",
    );
    expect(container?.textContent).not.toContain("2026-06-01");
  });

  it("does not add missing account balances when editing an old snapshot", async () => {
    render(
      <HouseholdProvider initialEnvelope={historicalEnvelope()}>
        <SnapshotsSection />
        <SnapshotBalancesProbe snapshotId="old" />
      </HouseholdProvider>,
    );

    await click(button("Edit"));
    await change(textbox("Edit 2026-01-01 label"), "Updated old snapshot");
    await click(button("Save snapshot"));

    expect(container?.textContent).toContain("old:tfsa");
    expect(container?.textContent).not.toContain("old:tfsa,cash");
  });

  it("allows clearing a snapshot balance before entering a replacement value", async () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <SnapshotsSection />
        <SnapshotBalanceProbe snapshotId="s1" accountId="tfsa" />
      </HouseholdProvider>,
    );

    await click(button("Edit"));
    const balanceInput = textbox("TFSA snapshot balance");

    await change(balanceInput, "");
    expect(balanceInput.value).toBe("");

    await change(balanceInput, "20000");
    await click(button("Save snapshot"));

    expect(container?.textContent).toContain("s1:tfsa:20000");
  });

  it("renders latest per-account and blended projected-asset change details", () => {
    render(
      <HouseholdProvider initialEnvelope={balanceChangeEnvelope()}>
        <SnapshotsSection />
      </HouseholdProvider>,
    );

    expect(container?.textContent).toContain("Latest snapshot balance change");
    expect(container?.textContent).toContain("TFSA balance change +$2,000 (+20.0%)");
    expect(container?.textContent).toContain("RRSP balance change +$1,000 (+10.0%)");
    expect(container?.textContent).toContain("Cash balance change +$500 (+10.0%)");
    expect(container?.textContent).toContain(
      "Blended projected-asset change +$3,000 (+15.0%)",
    );
  });
});

describe("date input formatting", () => {
  it("formats dates from local date parts instead of UTC ISO date", () => {
    const localDate = {
      getFullYear: () => 2026,
      getMonth: () => 0,
      getDate: () => 1,
      toISOString: () => "2026-01-02T04:30:00.000Z",
    } as Date;

    expect(toLocalDateInputValue(localDate)).toBe("2026-01-01");
  });
});

describe("AccountsSection — owner dropdown", () => {
  it("shows owner names in account row dropdown", () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          owners: [
            { id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 },
            { id: "o2", name: "Spouse", birth_year: 1990, retirement_age: 58 },
          ],
        }}
      >
        <AccountsSection />
      </HouseholdProvider>,
    );

    const ownerSelect = container?.querySelector<HTMLSelectElement>(
      "select[aria-label='TFSA account owner']",
    );
    expect(ownerSelect).not.toBeNull();
    const optionTexts = Array.from(ownerSelect?.options ?? []).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toContain("Alex");
    expect(optionTexts).toContain("Spouse");
  });

  it("saves owner_id when owner is selected from dropdown", async () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          owners: [
            { id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 },
          ],
        }}
      >
        <AccountsSection />
        <OwnerIdProbe accountName="TFSA" />
      </HouseholdProvider>,
    );

    const ownerSelect = container?.querySelector<HTMLSelectElement>(
      "select[aria-label='TFSA account owner']",
    )!;
    await changeSelect(ownerSelect, "o1");

    expect(container?.querySelector("output")?.textContent).toBe("owner:o1");
  });

  it("shows owner names in new account owner dropdown", async () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          owners: [
            { id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 },
            { id: "o2", name: "Spouse", birth_year: 1990, retirement_age: 58 },
          ],
        }}
      >
        <AccountsSection />
      </HouseholdProvider>,
    );

    await click(button("Add account"));

    const ownerSelect = container?.querySelector<HTMLSelectElement>(
      "select[aria-label='New account owner']",
    );
    expect(ownerSelect).not.toBeNull();
    const optionTexts = Array.from(ownerSelect?.options ?? []).map(
      (o) => o.textContent,
    );
    expect(optionTexts).toContain("Alex");
    expect(optionTexts).toContain("Spouse");
  });

  it("saves owner_id when owner selected from new account form", async () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          owners: [{ id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 }],
        }}
      >
        <AccountsSection />
        <OwnerIdProbe accountName="New RRSP" />
      </HouseholdProvider>,
    );

    await click(button("Add account"));
    await change(textbox("New account name"), "New RRSP");
    const ownerSelect = container?.querySelector<HTMLSelectElement>(
      "select[aria-label='New account owner']",
    )!;
    await changeSelect(ownerSelect, "o1");
    await click(button("Save account"));

    expect(container?.querySelector("output")?.textContent).toBe("owner:o1");
  });
});

describe("AccountsSection", () => {
  it("labels account inclusion as retirement projection scope", () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          accounts: [
            account({ id: "tfsa", name: "TFSA" }),
            account({ id: "cash", name: "Cash", include_in_fire: false }),
          ],
        }}
      >
        <AccountsSection />
      </HouseholdProvider>,
    );

    expect(container?.textContent).toContain("Projection");
    expect(
      container?.querySelector(
        "input[aria-label='TFSA use in retirement projection']",
      ),
    ).not.toBeNull();
    expect(container?.textContent).toContain("Projected");
    expect(container?.textContent).toContain("Net worth only");
  });

  it("labels latest balances as snapshot-derived read-only values", () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <AccountsSection />
      </HouseholdProvider>,
    );

    expect(
      container?.querySelector("[aria-label='TFSA latest balance $10,000 from latest snapshot']"),
    ).not.toBeNull();
    expect(container?.textContent).toContain("from latest snapshot");
  });

  it("supports explicit no-contribution accounts without annual input", async () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          accounts: [
            account({
              id: "tfsa",
              name: "TFSA",
              annual_contribution: 1_200,
            }),
          ],
        }}
      >
        <AccountsSection />
        <AnnualContributionProbe accountName="TFSA" />
      </HouseholdProvider>,
    );

    await click(button("TFSA no contribution"));

    expect(container?.textContent).toContain("annual:0");
    expect(container?.querySelector("input[aria-label='TFSA contribution']")).toBeNull();

    await click(button("TFSA annual contribution"));

    expect(container?.textContent).toContain("annual:1200");
    expect(container?.querySelector("input[aria-label='TFSA contribution']")).not.toBeNull();
  });

  it("allows existing account return edits to be cleared before committing", async () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <AccountsSection />
        <ExpectedReturnProbe accountName="TFSA" />
      </HouseholdProvider>,
    );

    const input = textbox("TFSA nominal return");

    await change(input, "");
    expect(input.value).toBe("");

    await change(input, "7");
    expect(input.value).toBe("7");

    await blur(input);

    expect(container?.textContent).toContain("return:0.07");
  });

  it("allows existing account contributions to be cleared before committing", async () => {
    render(
      <HouseholdProvider
        initialEnvelope={{
          ...envelope(),
          accounts: [
            account({
              id: "tfsa",
              name: "TFSA",
              annual_contribution: 1_200,
            }),
          ],
        }}
      >
        <AccountsSection />
        <AnnualContributionProbe accountName="TFSA" />
      </HouseholdProvider>,
    );

    const input = textbox("TFSA contribution");

    await change(input, "");
    expect(input.value).toBe("");

    await change(input, "2500");
    expect(input.value).toBe("2500");

    await blur(input);

    expect(container?.textContent).toContain("annual:2500");
  });

  it("stores monthly new-account contributions as annual amounts", async () => {
    render(
      <HouseholdProvider initialEnvelope={{ ...envelope(), accounts: [], snapshots: [] }}>
        <AccountsSection />
        <AnnualContributionProbe accountName="Monthly TFSA" />
      </HouseholdProvider>,
    );

    await click(button("Add account"));
    await change(textbox("New account name"), "Monthly TFSA");
    await click(button("New account monthly contribution"));
    await change(textbox("New account contribution"), "100");
    await click(button("Save account"));

    expect(container?.textContent).toContain("annual:1200");
  });

  it("stores no-contribution new accounts as zero", async () => {
    render(
      <HouseholdProvider initialEnvelope={{ ...envelope(), accounts: [], snapshots: [] }}>
        <AccountsSection />
        <AnnualContributionProbe accountName="Cash Buffer" />
      </HouseholdProvider>,
    );

    await click(button("Add account"));
    await change(textbox("New account name"), "Cash Buffer");
    await click(button("Save account"));

    expect(container?.textContent).toContain("annual:0");
  });

  it("ignores disabled draft contribution text for no-contribution new accounts", async () => {
    render(
      <HouseholdProvider initialEnvelope={{ ...envelope(), accounts: [], snapshots: [] }}>
        <AccountsSection />
        <AnnualContributionProbe accountName="No Save Plan" />
      </HouseholdProvider>,
    );

    await click(button("Add account"));
    await change(textbox("New account name"), "No Save Plan");
    await click(button("New account annual contribution"));
    await change(textbox("New account contribution"), "not a number");
    await click(button("New account no contribution"));
    await click(button("Save account"));

    expect(container?.textContent).toContain("annual:0");
    expect(container?.textContent).not.toContain("Enter a valid dollar amount.");
  });
});

function OwnerIdProbe({ accountName }: { accountName: string }) {
  const state = useHouseholdState();
  const account = state.current.accounts.find((item) => item.name === accountName);
  return <output>{account?.owner_id ? `owner:${account.owner_id}` : "unassigned"}</output>;
}

function AnnualContributionProbe({ accountName }: { accountName: string }) {
  const state = useHouseholdState();
  const account = state.current.accounts.find((item) => item.name === accountName);

  return <output>{account ? `annual:${account.annual_contribution}` : "missing"}</output>;
}

function ExpectedReturnProbe({ accountName }: { accountName: string }) {
  const state = useHouseholdState();
  const account = state.current.accounts.find((item) => item.name === accountName);

  return (
    <output>
      {account ? `return:${account.expected_nominal_return}` : "missing"}
    </output>
  );
}

function SnapshotBalancesProbe({ snapshotId }: { snapshotId: string }) {
  const state = useHouseholdState();
  const snapshot = state.current.snapshots.find((item) => item.id === snapshotId);
  const accountIds =
    snapshot?.account_balances.map((balance) => balance.account_id).join(",") ??
    "missing";

  return <output>{`${snapshotId}:${accountIds}`}</output>;
}

function SnapshotBalanceProbe({
  snapshotId,
  accountId,
}: {
  snapshotId: string;
  accountId: string;
}) {
  const state = useHouseholdState();
  const snapshot = state.current.snapshots.find((item) => item.id === snapshotId);
  const balance = snapshot?.account_balances.find(
    (item) => item.account_id === accountId,
  );

  return (
    <output>
      {balance ? `${snapshotId}:${accountId}:${balance.balance}` : "missing"}
    </output>
  );
}

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0.05,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const envelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 1,
  household_name: "Interaction Household",
  profile: {
    birth_year: 1990,
    retirement_age: 60,
    default_currency: "CAD",
  },
  assumptions: {
    annual_expenses: 40_000,
    withdrawal_input: { kind: "rate", value: 0.04 },
    inflation_rate: 0.02,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
  accounts: [account({ id: "tfsa", name: "TFSA" })],
  snapshots: [
    {
      id: "s1",
      date: "2026-05-01",
      account_balances: [{ account_id: "tfsa", balance: 10_000 }],
    },
  ],
});

const historicalEnvelope = (): FireEnvelope => ({
  ...envelope(),
  accounts: [
    account({ id: "tfsa", name: "TFSA" }),
    account({ id: "cash", name: "Cash", include_in_fire: false }),
  ],
  snapshots: [
    {
      id: "old",
      date: "2026-01-01",
      label: "Old",
      account_balances: [{ account_id: "tfsa", balance: 10_000 }],
    },
  ],
});

const balanceChangeEnvelope = (): FireEnvelope => ({
  ...envelope(),
  accounts: [
    account({ id: "tfsa", name: "TFSA" }),
    account({ id: "rrsp", name: "RRSP" }),
    account({ id: "cash", name: "Cash", include_in_fire: false }),
  ],
  snapshots: [
    {
      id: "prior",
      date: "2026-01-01",
      account_balances: [
        { account_id: "tfsa", balance: 10_000 },
        { account_id: "rrsp", balance: 10_000 },
        { account_id: "cash", balance: 5_000 },
      ],
    },
    {
      id: "latest",
      date: "2026-02-01",
      account_balances: [
        { account_id: "tfsa", balance: 12_000 },
        { account_id: "rrsp", balance: 11_000 },
        { account_id: "cash", balance: 5_500 },
      ],
    },
  ],
});

const render = (ui: ReactNode) => {
  if (!container) {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(ui);
  });
};

const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
};

const change = async (
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  await act(async () => {
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
};

const blur = async (input: HTMLInputElement) => {
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await Promise.resolve();
  });
};

const button = (name: string): HTMLButtonElement => {
  const match = Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) => element.getAttribute("aria-label") === name || element.textContent === name,
  );
  if (!match) {
    throw new Error(`Button not found: ${name}`);
  }
  return match;
};

const textbox = (label: string): HTMLInputElement => {
  const match = Array.from(container?.querySelectorAll("input") ?? []).find(
    (element) => element.getAttribute("aria-label") === label,
  );
  if (!match) {
    throw new Error(`Textbox not found: ${label}`);
  }
  return match;
};

const setNativeValue = (
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) => {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
};

const changeSelect = async (select: HTMLSelectElement, value: string) => {
  await act(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    );
    descriptor?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await Promise.resolve();
  });
};
