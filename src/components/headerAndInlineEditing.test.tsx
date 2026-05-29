// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFreshHousehold, type FireEnvelope } from "../domain";
import { HouseholdProvider, LOCAL_HOUSEHOLD_STORAGE_KEY, useHouseholdState } from "../state";
import { AssumptionsSection } from "./AssumptionsSection";
import { HeaderStrip } from "./HeaderStrip";
import { InlineEditable } from "./InlineEditable";

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
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("InlineEditable", () => {
  it("commits valid edits on blur and Enter", async () => {
    const onCommit = vi.fn();
    render(
      <InlineEditable
        label="amount"
        value="10"
        displayValue="10"
        parse={(value) => ({ success: true, value: Number(value) })}
        onCommit={onCommit}
      />,
    );

    await click(button("Edit amount"));
    await change(textbox("amount"), "12");
    await blur(textbox("amount"));
    expect(onCommit).toHaveBeenLastCalledWith(12);

    render(
      <InlineEditable
        label="amount"
        value="12"
        displayValue="12"
        parse={(value) => ({ success: true, value: Number(value) })}
        onCommit={onCommit}
      />,
    );

    await click(button("Edit amount"));
    await change(textbox("amount"), "14");
    await keyDown(textbox("amount"), "Enter");

    expect(onCommit).toHaveBeenLastCalledWith(14);
  });

  it("cancels edits on Escape", async () => {
    const onCommit = vi.fn();
    render(
      <InlineEditable
        label="amount"
        value="10"
        displayValue="10"
        parse={(value) => ({ success: true, value: Number(value) })}
        onCommit={onCommit}
      />,
    );

    await click(button("Edit amount"));
    await change(textbox("amount"), "14");
    await keyDown(textbox("amount"), "Escape");

    expect(onCommit).not.toHaveBeenCalled();
    expect(button("Edit amount").textContent).toBe("10");
  });

  it("preserves prior valid state and shows validation for invalid edits", async () => {
    const onCommit = vi.fn();
    render(
      <InlineEditable
        label="amount"
        value="10"
        displayValue="10"
        parse={(value) =>
          value === "bad"
            ? { success: false, message: "Invalid amount." }
            : { success: true, value: Number(value) }
        }
        onCommit={onCommit}
      />,
    );

    await click(button("Edit amount"));
    await change(textbox("amount"), "bad");
    await keyDown(textbox("amount"), "Enter");

    expect(onCommit).not.toHaveBeenCalled();
    expect(textbox("amount").value).toBe("bad");
    expect(container?.textContent).toContain("Invalid amount.");
  });
});

describe("HeaderStrip", () => {
  it("shows dirty Save label after a committed household name edit", async () => {
    renderHeader();

    await change(textbox("Household name"), "Edited Household");
    await keyDown(textbox("Household name"), "Enter");

    expect(document.body.contains(button("Save*"))).toBe(true);
  });

  it("saves incremental changes to browser storage without downloading a file", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL");
    renderHeader();

    await change(textbox("Household name"), "Saved Locally");
    await keyDown(textbox("Household name"), "Enter");
    await click(button("Save*"));

    const savedJson = window.localStorage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY);
    expect(savedJson).not.toBeNull();
    expect(JSON.parse(savedJson ?? "{}")).toMatchObject({
      household_name: "Saved Locally",
      revision: 1,
    });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(optionalButton("Save*")).toBeUndefined();
    expect(optionalButton("Save")).not.toBeUndefined();
  });

  it("exports a JSON file only from the explicit export action", async () => {
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fire-export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    renderHeader();

    await click(button("Export JSON"));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("keeps the current browser save when exporting JSON", async () => {
    const existingEnvelope = {
      ...createFreshHousehold(),
      household_name: "Existing Browser Save",
    };
    window.localStorage.setItem(
      LOCAL_HOUSEHOLD_STORAGE_KEY,
      JSON.stringify(existingEnvelope),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fire-export");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderHeader({
      ...createFreshHousehold(),
      household_name: "Exported But Not Saved",
    });

    await click(button("Export JSON"));

    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ household_name: "Existing Browser Save" });
  });

  it("replaces the browser save after a valid import", async () => {
    window.localStorage.setItem(
      LOCAL_HOUSEHOLD_STORAGE_KEY,
      JSON.stringify({ ...createFreshHousehold(), household_name: "Old Browser Save" }),
    );
    renderHeader();

    await importFile(
      new File(
        [
          JSON.stringify({
            ...createFreshHousehold(),
            saved_at: "2026-05-27T00:00:00.000Z",
            household_name: "Imported Browser Save",
          }),
        ],
        "import.json",
        { type: "application/json" },
      ),
    );

    expect(
      JSON.parse(window.localStorage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY) ?? "{}"),
    ).toMatchObject({ household_name: "Imported Browser Save" });
  });

  it("clears the browser save after reset is confirmed", async () => {
    window.localStorage.setItem(
      LOCAL_HOUSEHOLD_STORAGE_KEY,
      JSON.stringify({ ...createFreshHousehold(), household_name: "Stored Household" }),
    );
    renderHeader();

    await click(button("Reset"));
    await click(button("Yes, reset"));

    expect(window.localStorage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY)).toBeNull();
  });

  it("shows and cancels reset confirmation inline", async () => {
    renderHeader();

    await click(button("Reset"));

    expect(container?.textContent).toContain(
      "Discard current in-memory household and start fresh?",
    );

    await click(button("No"));

    expect(container?.textContent).not.toContain(
      "Discard current in-memory household and start fresh?",
    );
  });

  it("shows a validation banner for invalid imports", async () => {
    renderHeader();

    await importFile(new File(["not json"], "bad.json", { type: "application/json" }));

    expect(container?.textContent).toContain("Validation error");
    expect(container?.textContent).toContain("file");
    expect(container?.textContent).toContain("Invalid JSON");
  });

  it("shows a validation banner when file reading fails and clears the input", async () => {
    renderHeader();
    const input = fileInput();

    await importFile({
      name: "unreadable.json",
      text: () => Promise.reject(new Error("read failed")),
    });

    expect(container?.textContent).toContain("Validation error");
    expect(container?.textContent).toContain("file");
    expect(container?.textContent).toContain("Could not read file.");
    expect(input.value).toBe("");
  });

  it("commits household name with Enter and cancels draft changes with Escape", async () => {
    renderHeader();

    await change(textbox("Household name"), "Committed Household");
    await keyDown(textbox("Household name"), "Enter");

    expect(textbox("Household name").value).toBe("Committed Household");
    expect(document.body.contains(button("Save*"))).toBe(true);

    await change(textbox("Household name"), "Draft Household");
    await keyDown(textbox("Household name"), "Escape");

    expect(textbox("Household name").value).toBe("Committed Household");
  });
});

describe("AssumptionsSection — owner management", () => {
  it("renders each owner's name, birth year, and retirement age", () => {
    renderAssumptions({
      ...createFreshHousehold(),
      owners: [
        { id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 },
        { id: "o2", name: "Spouse", birth_year: 1990, retirement_age: 58 },
      ],
    });

    expect(container?.textContent).toContain("Alex");
    expect(container?.textContent).toContain("1988");
    expect(container?.textContent).toContain("55");
    expect(container?.textContent).toContain("Spouse");
    expect(container?.textContent).toContain("1990");
    expect(container?.textContent).toContain("58");
  });

  it("adds a second owner when Add owner is clicked", async () => {
    renderAssumptions(createFreshHousehold());

    await click(button("Add owner"));

    const probe = container?.querySelector<HTMLElement>("[data-owner-count]");
    expect(probe?.dataset.ownerCount).toBe("2");
  });

  it("removes an owner when Remove owner is clicked (only when more than one)", async () => {
    renderAssumptions({
      ...createFreshHousehold(),
      owners: [
        { id: "o1", name: "Alex", birth_year: 1988, retirement_age: 55 },
        { id: "o2", name: "Spouse", birth_year: 1990, retirement_age: 58 },
      ],
    });

    await click(button("Remove owner o2"));

    expect(container?.textContent).toContain("Alex");
    expect(container?.textContent).not.toContain("Spouse");
  });

  it("does not render Remove owner button when only one owner", () => {
    renderAssumptions(createFreshHousehold());

    const removeButtons = Array.from(
      container?.querySelectorAll("button") ?? [],
    ).filter((b) => b.textContent?.includes("Remove owner"));

    expect(removeButtons).toHaveLength(0);
  });
});

const renderHeader = (initialEnvelope: FireEnvelope = createFreshHousehold()) => {
  render(
    <HouseholdProvider initialEnvelope={initialEnvelope}>
      <HeaderStrip />
    </HouseholdProvider>,
  );
};

const renderAssumptions = (initialEnvelope: FireEnvelope = createFreshHousehold()) => {
  render(
    <HouseholdProvider initialEnvelope={initialEnvelope}>
      <AssumptionsSection
        displayMode="real"
        contributionMode="with"
        onDisplayModeChange={() => undefined}
        onContributionModeChange={() => undefined}
      />
      <OwnerCountProbe />
    </HouseholdProvider>,
  );
};

function OwnerCountProbe() {
  const state = useHouseholdState();
  return <span data-owner-count={String(state.current.owners?.length ?? 0)} />;
}

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

const change = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    setNativeInputValue(input, value);
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

const keyDown = async (input: HTMLInputElement, key: string) => {
  await act(async () => {
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    await Promise.resolve();
  });
};

const importFile = async (file: Pick<File, "name" | "text">) => {
  const input = fileInput();
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [file],
  });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

const button = (name: string): HTMLButtonElement => {
  const match = optionalButton(name);
  if (!match) {
    throw new Error(`Button not found: ${name}`);
  }
  return match;
};

const optionalButton = (name: string): HTMLButtonElement | undefined =>
  Array.from(container?.querySelectorAll("button") ?? []).find(
    (element) => element.getAttribute("aria-label") === name || element.textContent === name,
  );

const textbox = (label: string): HTMLInputElement => {
  const match = Array.from(container?.querySelectorAll("input") ?? []).find(
    (element) =>
      element.getAttribute("aria-label") === label ||
      element.closest("label")?.textContent === label,
  );
  if (!match) {
    throw new Error(`Textbox not found: ${label}`);
  }
  return match;
};

const setNativeInputValue = (input: HTMLInputElement, value: string) => {
  const valueSetter = Object.getOwnPropertyDescriptor(input, "value")?.set;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(input, value);
    return;
  }

  valueSetter?.call(input, value);
};

const fileInput = (): HTMLInputElement => {
  const input = container?.querySelector<HTMLInputElement>("input[type='file']");
  if (!input) {
    throw new Error("File input not found");
  }
  return input;
};
