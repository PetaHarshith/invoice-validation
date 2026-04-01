import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add it to your .env");
}

// postgres-js client
const client = postgres(process.env.DATABASE_URL, {
    prepare: false, // avoids some edge cases in dev; safe default
});

// drizzle db instance
export const db = drizzle(client);