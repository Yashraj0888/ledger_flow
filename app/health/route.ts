import { connection } from "next/server";
import { rpc } from "@/lib/db";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /health - liveness + database connectivity (for load balancers). */
export async function GET() {
  await connection();
  try {
    await rpc<number>("ping");
    return Response.json(
      { status: "ok", database: "up" },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "down" },
      { status: 503, headers: NO_STORE },
    );
  }
}
