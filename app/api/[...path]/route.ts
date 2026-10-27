import { AppError } from "@/lib/errors";
import { route } from "@/lib/http";

/** Catch-all for unknown /api/* paths so clients always get the JSON envelope. */
const notFound = route(async () => {
  throw new AppError("ROUTE_NOT_FOUND", "Route not found");
});

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
