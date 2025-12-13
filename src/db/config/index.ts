// import {Pool} from '@neondatabase/serverless';
// import {drizzle} from 'drizzle-orm/neon-serverless';
// import * as schema from "../schema/index.js"
//
// const pool = new Pool({connectionString: process.env.DATABASE_URL!})
// export const db = drizzle({client: pool, schema})
import * as schema from "../schema/index.js"
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

// To work in edge environments (Cloudflare Workers, Vercel Edge, etc.), enable querying over fetch
neonConfig.poolQueryViaFetch = true

const sql = neon(process.env.DATABASE_URL || "");
export const db = drizzle(sql, { schema });

