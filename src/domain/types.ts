export type AccountType =
  | "tfsa"
  | "rrsp"
  | "non_registered"
  | "cash"
  | "other_asset";

export type WithdrawalInput =
  | {
      kind: "rate";
      value: number;
    }
  | {
      kind: "fixed_annual_withdrawal";
      value: number;
    };

export type HouseholdProfile = {
  birth_year: number;
  retirement_age: number;
  default_currency: string;
};

export type Owner = {
  id: string;
  name: string;
  birth_year: number;
  retirement_age: number;
};

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  owner_id?: string;
  expected_nominal_return: number;
  annual_contribution: number;
  include_in_fire: boolean;
  archived: boolean;
};

export type AccountBalance = {
  account_id: string;
  balance: number;
};

export type Snapshot = {
  id: string;
  date: string;
  label?: string;
  notes?: string;
  account_balances: AccountBalance[];
};

export type HouseholdAssumptions = {
  annual_expenses: number;
  withdrawal_input: WithdrawalInput;
  inflation_rate: number;
  barista_combined_income: number;
  projection_end_age: number;
};

export type FireEnvelope = {
  schema_version: 1;
  saved_at: string;
  revision: number;
  household_name: string;
  profile: HouseholdProfile;
  owners?: Owner[];
  accounts: Account[];
  snapshots: Snapshot[];
  assumptions: HouseholdAssumptions;
};
