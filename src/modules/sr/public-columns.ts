/**
 * Drizzle `columns` for SR rows embedded in orders, settlements and reports: leaves out
 * the private profile details (address, NID, emergency contact, notes) that only admins
 * see on the SR profile.
 */
export const srPublicColumns = {
  address: false,
  nidNumber: false,
  emergencyContact: false,
  notes: false,
} as const;
