import "dotenv/config";
import {Config, defineConfig} from "drizzle-kit";

if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
}

export default defineConfig({
    schema: "./src/db/schema/index.ts",
    out: "./src/db/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL!,
    },
});