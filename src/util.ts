/** Small shared helpers used across tool modules. */

import { z } from "zod";

export type Row = Record<string, unknown>;

/** Shared list-pagination params for a manage_* tool's inputSchema. */
export const listParams = {
  limit: z.number().int().default(50).describe("Number of results to return (list)"),
  offset: z.number().int().default(0).describe("Number of results to skip (list)"),
  search: z.string().optional().describe("Search query (list)"),
  sort: z.string().optional().describe("Field to sort by (list)"),
  order: z.enum(["asc", "desc"]).optional().describe("Sort order (list)"),
};

/** Extract the standard list args from a handler's parsed args. */
export function listArgs(args: Row) {
  return {
    limit: args.limit as number,
    offset: args.offset as number,
    search: args.search as string | undefined,
    sort: args.sort as string | undefined,
    order: args.order as string | undefined,
  };
}

/** Select `keys` from `obj`, defaulting missing values to null (getattr(...,None)). */
export function pick(obj: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) out[k] = obj[k] ?? null;
  return out;
}

/** Drop keys whose value is undefined or null (Python's model_dump + None filter). */
export function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null),
  );
}

/** Last path segment of a filesystem path. */
export function basename(path: string): string {
  return path.replace(/^.*[\\/]/, "");
}

/** Create the parent directory of `filePath` if it has one. */
export async function ensureDir(filePath: string): Promise<void> {
  const dir = filePath.replace(/[\\/][^\\/]*$/, "");
  if (dir && dir !== filePath) {
    await Deno.mkdir(dir, { recursive: true }).catch(() => {});
  }
}

/**
 * Snipe-IT wraps create/update responses as `{status, messages, payload}`.
 * Return the payload when present, else the response itself (matching the
 * Python code's `result.get("payload", result)`).
 */
export function payloadOf(res: Record<string, unknown>): Record<string, unknown> {
  const payload = res.payload;
  return payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : res;
}
