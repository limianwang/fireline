import { describe, expect, it } from "vitest";

import type { FireEnvelope } from "../domain";
import {
  clearLocalHousehold,
  LOCAL_HOUSEHOLD_STORAGE_KEY,
  loadLocalHousehold,
  saveLocalHousehold,
} from "./localPersistence";

const envelope = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "2026-05-27T00:00:00.000Z",
  revision: 1,
  household_name: "Stored Household",
  profile: {
    birth_year: 1990,
    retirement_age: 60,
    default_currency: "CAD",
  },
  assumptions: {
    annual_expenses: 40_000,
    withdrawal_rate: 0.04,
    inflation_rate: 0.02,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
  accounts: [],
  snapshots: [],
});

describe("local household persistence", () => {
  it("saves and loads a validated household envelope", () => {
    const storage = new MapStorage();

    saveLocalHousehold(envelope(), storage);

    expect(storage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY)).toContain(
      '"household_name": "Stored Household"',
    );
    expect(loadLocalHousehold(storage)).toMatchObject({
      household_name: "Stored Household",
    });
  });

  it("ignores missing or invalid stored households", () => {
    const storage = new MapStorage();

    expect(loadLocalHousehold(storage)).toBeNull();

    storage.setItem(LOCAL_HOUSEHOLD_STORAGE_KEY, "{bad json");

    expect(loadLocalHousehold(storage)).toBeNull();
  });

  it("clears the stored household without touching other storage keys", () => {
    const storage = new MapStorage();
    saveLocalHousehold(envelope(), storage);
    storage.setItem("unrelated", "keep");

    clearLocalHousehold(storage);

    expect(storage.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});

class MapStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
