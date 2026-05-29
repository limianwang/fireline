// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import App from "../App";
import type { Account, FireEnvelope } from "../domain/types";
import { HouseholdProvider, useHouseholdState } from "../state";

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

describe("FIRE dashboard interactions", () => {
  it("renders withdrawal assumptions as a compact readable control", () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <App />
      </HouseholdProvider>,
    );

    const withdrawalField = elementWithText("Withdrawal")?.closest(".assumption-field");

    expect(withdrawalField?.textContent).toContain("Rate");
    expect(withdrawalField?.textContent).toContain("Fixed");
    expect(withdrawalField?.textContent).toContain("4%");
    expect(withdrawalField?.textContent).toContain("of annual expenses");
    expect(withdrawalField?.textContent).not.toContain("fixed annual withdrawal");
  });

  it("changes projection display mode without mutating stored contributions", async () => {
    render(
      <HouseholdProvider initialEnvelope={envelope()}>
        <App />
        <AnnualContributionProbe accountId="tfsa" />
      </HouseholdProvider>,
    );

    await click(button("nominal $"));
    await click(button("without"));
    await click(button("Table"));

    expect(container?.textContent).toContain("$990");
    expect(container?.textContent).toContain("$1,100");
    expect(container?.textContent).toContain("annual:100");
  });

  it("renders FIRE states as a timeline with reached labels and projected portfolio context", () => {
    render(
      <HouseholdProvider initialEnvelope={reachedEnvelope()}>
        <App />
      </HouseholdProvider>,
    );

    expect(container?.querySelector(".lens-timeline-track")).not.toBeNull();
    expect(container?.textContent).toContain("✓ Reached");
    expect(container?.textContent).toContain("2040, age 40");

    const coastLens = elementWithText("Coast")?.closest(".lens-item");
    expect(coastLens?.getAttribute("title")).toContain(
      "Projected portfolio at this date: $1,000",
    );
    expect(coastLens?.getAttribute("aria-label")).toContain(
      "Projected portfolio at this date: $1,000",
    );
    expect(coastLens?.textContent).toContain(
      "Guideline: current assets must grow to the $1,000 FIRE target by retirement without more contributions.",
    );
    expect(coastLens?.textContent).toContain("At this date: $1,000");
  });

  it("does not present a fresh household as already at FIRE", () => {
    render(
      <HouseholdProvider>
        <App />
      </HouseholdProvider>,
    );

    expect(container?.textContent).toContain("Set expenses");
    expect(container?.textContent).toContain("No snapshot");
    expect(container?.textContent).toContain(
      "Add expenses and a snapshot to calculate FIRE progress.",
    );
    expect(progressbar("FIRE progress").getAttribute("aria-valuenow")).toBe("0");
  });
});

function AnnualContributionProbe({ accountId }: { accountId: string }) {
  const state = useHouseholdState();
  const account = state.current.accounts.find((item) => item.id === accountId);

  return <output>{account ? `annual:${account.annual_contribution}` : "missing"}</output>;
}

const account = (overrides: Partial<Account> & Pick<Account, "id">): Account => ({
  id: overrides.id,
  name: overrides.name ?? overrides.id,
  type: overrides.type ?? "tfsa",
  expected_nominal_return: overrides.expected_nominal_return ?? 0.1,
  annual_contribution: overrides.annual_contribution ?? 0,
  include_in_fire: overrides.include_in_fire ?? true,
  archived: overrides.archived ?? false,
});

const envelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 1,
  household_name: "FIRE dashboard household",
  profile: {
    birth_year: 2000,
    retirement_age: 42,
    default_currency: "CAD",
  },
  accounts: [
    account({
      id: "tfsa",
      name: "TFSA",
      annual_contribution: 100,
    }),
  ],
  snapshots: [
    {
      id: "latest",
      date: "2040-01-01",
      account_balances: [{ account_id: "tfsa", balance: 900 }],
    },
  ],
  assumptions: {
    annual_expenses: 40,
    withdrawal_input: { kind: "rate", value: 0.04 },
    inflation_rate: 0.1,
    barista_combined_income: 0,
    projection_end_age: 43,
  },
});

const reachedEnvelope = (): FireEnvelope => ({
  ...envelope(),
  snapshots: [
    {
      id: "latest",
      date: "2040-01-01",
      account_balances: [{ account_id: "tfsa", balance: 1_000 }],
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

const button = (name: string): HTMLButtonElement => {
  const match = Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) =>
      element.getAttribute("aria-label") === name || element.textContent === name,
  );
  if (!match) {
    throw new Error(`Button not found: ${name}`);
  }
  return match;
};

const elementWithText = (text: string): Element | undefined =>
  Array.from(container?.querySelectorAll("*") ?? []).find(
    (element) => element.textContent === text,
  );

const progressbar = (name: string): HTMLElement => {
  const match = Array.from(container?.querySelectorAll('[role="progressbar"]') ?? [])
    .find((element) => element.getAttribute("aria-label") === name);
  if (!match) {
    throw new Error(`Progressbar not found: ${name}`);
  }
  return match as HTMLElement;
};
