/**
 * Shared tool-definition shape and result helpers.
 *
 * Each tool module exports a factory `(client) => ToolDef[]`; `server.ts`
 * registers them, applying the SNIPEIT_ALLOWED_TOOLS whitelist by filtering on
 * `name`. Tools return their result dict as pretty-printed JSON text, matching
 * the Python server's `dict`-returning behavior.
 */

import type { ZodRawShape } from "zod";
import {
  SnipeITAuthenticationError,
  SnipeITError,
  SnipeITNotFoundError,
  SnipeITValidationError,
} from "./client.ts";

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  [key: string]: unknown;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations?: ToolAnnotations;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/** Serialize a result object as the tool's text content. */
export function jsonResult(obj: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

/**
 * Wrap a tool body so thrown Snipe-IT errors become the same
 * `{ success: false, error }` payloads the Python tools returned.
 */
export function guarded(
  toolName: string,
  fn: (args: Record<string, unknown>) => Promise<unknown>,
): (args: Record<string, unknown>) => Promise<ToolResult> {
  return async (args) => {
    try {
      return jsonResult(await fn(args));
    } catch (e) {
      if (e instanceof SnipeITNotFoundError) {
        return jsonResult({ success: false, error: `Not found: ${e.message}` });
      }
      if (e instanceof SnipeITAuthenticationError) {
        return jsonResult({
          success: false,
          error: `Authentication failed: ${e.message}`,
        });
      }
      if (e instanceof SnipeITValidationError) {
        return jsonResult({
          success: false,
          error: `Validation error: ${e.message}`,
        });
      }
      if (e instanceof SnipeITError) {
        return jsonResult({ success: false, error: `Snipe-IT error: ${e.message}` });
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[snipeit-mcp] Unexpected error in ${toolName}:`, e);
      return jsonResult({ success: false, error: `Unexpected error: ${msg}` });
    }
  };
}
