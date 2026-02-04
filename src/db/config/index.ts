import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema"

// const pool = new Pool({connectionString: process.env.DATABASE_URL!})
// export const db = drizzle({client: pool, schema})

const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    max: 10,
});

export const db = drizzle({ client: pool, schema });
