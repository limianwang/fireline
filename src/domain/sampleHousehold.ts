import type { FireEnvelope } from "./types";

export const createFreshHousehold = (): FireEnvelope => ({
  schema_version: 1,
  saved_at: "1970-01-01T00:00:00.000Z",
  revision: 0,
  household_name: "New Household",
  profile: {
    birth_year: 1990,
    retirement_age: 65,
    default_currency: "CAD",
  },
  owners: [
    {
      id: "owner-primary",
      name: "Primary",
      birth_year: 1990,
      retirement_age: 65,
      projection_end_age: 90,
    },
  ],
  accounts: [],
  snapshots: [],
  assumptions: {
    annual_expenses: 0,
    withdrawal_input: {
      kind: "rate",
      value: 0.04,
    },
    inflation_rate: 0.025,
    barista_combined_income: 0,
    projection_end_age: 90,
  },
});
