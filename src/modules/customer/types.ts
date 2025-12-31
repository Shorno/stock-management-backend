import type { customer } from "../../db/schema";

export type Customer = typeof customer.$inferSelect;
export type NewCustomer = typeof customer.$inferInsert;
