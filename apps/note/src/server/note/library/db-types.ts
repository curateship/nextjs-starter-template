import type { CustomShellDb } from "@/server/db"

/** The database, or one transaction on it: anything a query can run on. */
export type Db = CustomShellDb | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0]
