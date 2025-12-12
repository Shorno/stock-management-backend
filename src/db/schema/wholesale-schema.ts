import {pgTable, serial, varchar} from "drizzle-orm/pg-core";
import {timestamps} from "../column.helpers.js";

export const dsr = pgTable("dsr", {
    id: serial("id").primaryKey(),
    name: varchar("name", {length: 100}).notNull(),
    slug: varchar("slug", {length: 100}).notNull().unique(),
    ...timestamps
});

export const route = pgTable("route", {
    id: serial("id").primaryKey(),
    name: varchar("name", {length: 100}).notNull(),
    slug: varchar("slug", {length: 100}).notNull().unique(),
    ...timestamps
});