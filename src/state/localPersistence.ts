import { parseFireJson, type FireEnvelope } from "../domain";

export const LOCAL_HOUSEHOLD_STORAGE_KEY = "fireline.household.v1";

export const loadLocalHousehold = (
  storage: Storage | null = getLocalStorage(),
): FireEnvelope | null => {
  const json = storage?.getItem(LOCAL_HOUSEHOLD_STORAGE_KEY);
  if (!json) {
    return null;
  }

  const result = parseFireJson(json);
  return result.success ? result.data : null;
};

export const saveLocalHousehold = (
  envelope: FireEnvelope,
  storage: Storage | null = getLocalStorage(),
): boolean => {
  if (!storage) {
    return false;
  }

  storage.setItem(LOCAL_HOUSEHOLD_STORAGE_KEY, `${JSON.stringify(envelope, null, 2)}\n`);
  return true;
};

export const clearLocalHousehold = (
  storage: Storage | null = getLocalStorage(),
): boolean => {
  if (!storage) {
    return false;
  }

  storage.removeItem(LOCAL_HOUSEHOLD_STORAGE_KEY);
  return true;
};

const getLocalStorage = (): Storage | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
