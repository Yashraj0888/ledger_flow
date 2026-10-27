import { connection } from "next/server";
import { ZodError } from "zod";
import { AppError, type FieldError } from "@/lib/errors";
import type { PaginationMeta } from "@/lib/pagination";

const BASE_HEADERS = { "Cache-Control": "no-store" };

export function ok<T>(
  data: T,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json(
    { data },
    { status, headers: { ...BASE_HEADERS, ...extraHeaders } },
  );
}

export function okList<T>(data: T[], pagination: PaginationMeta): Response {
  return Response.json({ data, pagination }, { headers: BASE_HEADERS });
}

export function errorResponse(error: AppError): Response {
  const body: {
    error: {
      code: string;
      message: string;
      details?: FieldError[] | Record<string, unknown>;
    };
  } = { error: { code: error.code, message: error.message } };
  if (error.details !== undefined) body.error.details = error.details;

  return Response.json(body, {
    status: error.status,
    headers: { ...BASE_HEADERS, ...error.headers },
  });
}

/** Convert a ZodError into the API's validation error (code chosen per field). */
export function fromZodError(error: ZodError): AppError {
  const details: FieldError[] = error.issues.map((issue) => {
    const keys = "keys" in issue && Array.isArray(issue.keys) ? issue.keys : [];
    const field = issue.path.length
      ? issue.path.join(".")
      : keys.join(", ") || "body";
    return { field, message: issue.message };
  });

  // The first issue carrying a specific API code decides the top-level code.
  for (const issue of error.issues) {
    const code = (issue as { params?: { app_code?: string } }).params?.app_code;
    if (
      code === "INVALID_ACCOUNT_ID" ||
      code === "INVALID_TRANSACTION_TYPE" ||
      code === "INVALID_AMOUNT"
    ) {
      return new AppError(code, issue.message, { details });
    }
  }
  return new AppError("VALIDATION_ERROR", "Request validation failed", {
    details,
  });
}

/** Read and parse a JSON object body, or throw VALIDATION_ERROR. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.trim() === "") {
    throw new AppError("VALIDATION_ERROR", "Request body is required", {
      details: [{ field: "body", message: "Request body is required" }],
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", "Request body must be valid JSON", {
      details: [{ field: "body", message: "Request body must be valid JSON" }],
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError("VALIDATION_ERROR", "Request body must be a JSON object", {
      details: [{ field: "body", message: "Request body must be a JSON object" }],
    });
  }
  return parsed;
}

/**
 * Wrap a route handler: opts the request out of prerendering (Cache
 * Components) and converts every thrown error into the standard envelope.
 */
export function route<Ctx = unknown>(
  handler: (request: Request, ctx: Ctx) => Promise<Response>,
) {
  return async (request: Request, ctx: Ctx): Promise<Response> => {
    await connection();
    try {
      return await handler(request, ctx);
    } catch (error) {
      if (error instanceof AppError) return errorResponse(error);
      if (error instanceof ZodError) return errorResponse(fromZodError(error));
      console.error("[api] unhandled error", error);
      return errorResponse(
        new AppError("INTERNAL_ERROR", "An unexpected error occurred"),
      );
    }
  };
}
