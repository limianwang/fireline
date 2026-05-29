import type { FireEnvelope, Owner } from "../domain/types";

const owners = (envelope: FireEnvelope): Owner[] => envelope.owners ?? [];

export const resolvePlanningBirthYear = (envelope: FireEnvelope): number =>
  owners(envelope)[0]?.birth_year ?? envelope.profile.birth_year;

export const resolveRetirementYear = (envelope: FireEnvelope): number => {
  const ownerRetirementYears = owners(envelope).map(
    (owner) => owner.birth_year + owner.retirement_age,
  );

  return ownerRetirementYears.length > 0
    ? Math.max(...ownerRetirementYears)
    : envelope.profile.birth_year + envelope.profile.retirement_age;
};

export const resolveRetirementAge = (envelope: FireEnvelope): number =>
  resolveRetirementYear(envelope) - resolvePlanningBirthYear(envelope);

export const resolveProjectionEndYear = (envelope: FireEnvelope): number => {
  const ownerEndYears = owners(envelope).map(
    (owner) =>
      owner.birth_year +
      (owner.projection_end_age ?? envelope.assumptions.projection_end_age),
  );

  return ownerEndYears.length > 0
    ? Math.max(...ownerEndYears)
    : envelope.profile.birth_year + envelope.assumptions.projection_end_age;
};

export const resolveProjectionEndAge = (envelope: FireEnvelope): number =>
  resolveProjectionEndYear(envelope) - resolvePlanningBirthYear(envelope);
