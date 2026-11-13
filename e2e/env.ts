import os from "node:os";
import path from "node:path";

/** Shared by the config, the server start and the tests: where the test database lives and how to reach the server. */
export const PORT = Number(process.env.E2E_PORT ?? 3200);
export const BASE_URL = `http://localhost:${PORT}`;
export const DB_FILE = process.env.E2E_DATABASE_PATH ?? path.join(os.tmpdir(), "seatbit-e2e", "seatbit.db");
// Test-only values; nothing here talks to a real service.
export const SECRET = "e2e-only-not-a-real-secret-0123456789abcdef";
export const DISCORD_CLIENT_ID = "1234567890123456789";
export const CLAN_ID = "demo-clan";
export const CLAN_SLUG = "pixel-pirates";
