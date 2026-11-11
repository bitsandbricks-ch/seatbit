import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe: the server is up and the SQLite file is readable. */
export function GET() {
  try {
    db.get(sql`select 1`);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[health]", e);
    return Response.json({ ok: false }, { status: 503 });
  }
}
