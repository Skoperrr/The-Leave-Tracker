// Application defaults, not statutory entitlements. Existing organisation policies
// are preserved by the baseline seed's non-destructive upserts.
export const additionalLeaveTypes = [
  { code: 'FAMILY_RESPONSIBILITY', name: 'Family responsibility leave', balanceLimited: true },
  { code: 'MATERNITY', name: 'Maternity leave', balanceLimited: true },
  { code: 'PARENTAL', name: 'Parental leave', balanceLimited: true },
  { code: 'RELIGIOUS', name: 'Religious leave', balanceLimited: true },
] as const;

export const defaultLeaveTypes = [
  { code: 'ANNUAL', name: 'Annual leave', balanceLimited: true },
  { code: 'SICK', name: 'Sick leave', balanceLimited: true },
  ...additionalLeaveTypes,
] as const;
