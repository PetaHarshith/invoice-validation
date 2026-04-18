import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it to your .env");
}

// postgres-js client
// prepare: false is required for Neon serverless connections
const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
});

// Pass schema so db.query.<table>.findMany() relational queries work
export const db = drizzle(client, { schema });