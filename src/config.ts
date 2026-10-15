/**
 * Environment-driven configuration.
 *
 * API-key mode only: the server authenticates to Snipe-IT with a single static
 * personal-access token (`SNIPEIT_TOKEN`). There is no OAuth path - every
 * request uses the same bearer credential, resolved once at startup.
 *
 * Transport is chosen the same way as the Python server (MCP_TRANSPORT /
 * MCP_HOST / MCP_PORT) so deployment configs carry over unchanged.
 */

export class ConfigError extends Error {}

export type TransportType = "stdio" | "http";

export interface Config {
  url: string;
  token: string;
  transport: TransportType;
  host: string;
  port?: number;
  /** When set, only these tool names are registered (SNIPEIT_ALLOWED_TOOLS). */
  allowedTools?: Set<string>;
  /**
   * OAuth gate (HTTP transport only). When enabled, callers must present a
   * bearer token that the OIDC issuer's userinfo endpoint accepts. This is a
   * gate, not an identity system - every authorized caller still shares the one
   * static SNIPEIT_TOKEN upstream. See README "Remote access".
   */
  auth: AuthConfig;
}

export interface AuthConfig {
  /** MCP_AUTH - off by default; only meaningful for transport === "http". */
  enabled: boolean;
  /** MCP_OIDC_ISSUER - the authorization server advertised in PRM. */
  issuer?: string;
  /** userinfo endpoint used to introspect opaque tokens (derived or explicit). */
  userinfoUrl?: string;
  /**
   * JWKS endpoint. When set, access tokens are validated *locally* as signed
   * JWTs (RS256) against these cached keys instead of calling userinfo per
   * request - no round-trip, and validation survives brief issuer outages.
   * Set explicitly via MCP_OIDC_JWKS_URL, or derived as `${issuer}/keys` when
   * MCP_OIDC_JWKS is truthy. Absent ⇒ userinfo mode (the default).
   */
  jwksUrl?: string;
  /** MCP_OIDC_AUDIENCE - if set, require the JWT `aud` to equal this (the client id). */
  audience?: string;
  /** MCP_RESOURCE_URL - canonical resource id advertised in PRM (the /mcp URL). */
  resourceUrl?: string;
  /** MCP_ALLOWED_SUBS - if set, require sub/email ∈ this set (else 403). */
  allowedSubjects?: Set<string>;
}

const MIN_PORT = 1;
const MAX_PORT = 65535;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseBool(raw: string | undefined): boolean {
  return raw !== undefined && TRUE_VALUES.has(raw.trim().toLowerCase());
}

/** Parse a comma-separated env var into a trimmed Set, or undefined if empty. */
function parseSet(raw: string | undefined): Set<string> | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return undefined;
  return new Set(trimmed.split(",").map((s) => s.trim()).filter(Boolean));
}

export function loadConfig(): Config {
  const url = Deno.env.get("SNIPEIT_URL");
  if (!url) throw new ConfigError("SNIPEIT_URL is required");

  const token = Deno.env.get("SNIPEIT_TOKEN");
  if (!token) {
    throw new ConfigError(
      "SNIPEIT_TOKEN is required (static personal-access token / API-key mode)",
    );
  }

  const transportRaw = (Deno.env.get("MCP_TRANSPORT") ?? "stdio").toLowerCase();
  if (transportRaw !== "stdio" && transportRaw !== "http") {
    throw new ConfigError(
      `Invalid MCP_TRANSPORT '${transportRaw}'. Must be one of: stdio, http`,
    );
  }
  const transport = transportRaw as TransportType;

  let port: number | undefined;
  const portRaw = Deno.env.get("MCP_PORT");
  if (portRaw) {
    port = Number(portRaw);
    if (!Number.isInteger(port)) {
      throw new ConfigError(
        `MCP_PORT must be a valid integer, got: ${portRaw}`,
      );
    }
  }

  const host = Deno.env.get("MCP_HOST") ?? "127.0.0.1";

  if (transport === "http") {
    if (port === undefined) {
      throw new ConfigError("HTTP transport requires MCP_PORT to be set");
    }
    if (port < MIN_PORT || port > MAX_PORT) {
      throw new ConfigError(
        `MCP_PORT must be between ${MIN_PORT} and ${MAX_PORT}, got: ${port}`,
      );
    }
  }

  const allowedTools = parseSet(Deno.env.get("SNIPEIT_ALLOWED_TOOLS"));

  const auth = loadAuthConfig(transport);

  return { url, token, transport, host, port, allowedTools, auth };
}

function loadAuthConfig(transport: TransportType): AuthConfig {
  const enabled = parseBool(Deno.env.get("MCP_AUTH"));
  const issuer = Deno.env.get("MCP_OIDC_ISSUER")?.replace(/\/+$/, "");
  const resourceUrl = Deno.env.get("MCP_RESOURCE_URL");
  const userinfoUrl = Deno.env.get("MCP_OIDC_USERINFO_URL") ??
    (issuer ? `${issuer}/userinfo` : undefined);
  // Local JWKS validation is opt-in: explicit URL, or derived from the issuer
  // when MCP_OIDC_JWKS is truthy. Absent ⇒ fall back to the userinfo path.
  const jwksUrl = Deno.env.get("MCP_OIDC_JWKS_URL")?.trim() ||
    (parseBool(Deno.env.get("MCP_OIDC_JWKS")) && issuer
      ? `${issuer}/keys`
      : undefined);
  const audience = Deno.env.get("MCP_OIDC_AUDIENCE")?.trim() || undefined;
  const allowedSubjects = parseSet(Deno.env.get("MCP_ALLOWED_SUBS"));

  if (enabled) {
    // The gate only guards the HTTP surface; stdio has no request to challenge.
    if (transport !== "http") {
      throw new ConfigError(
        "MCP_AUTH is only supported with MCP_TRANSPORT=http",
      );
    }
    if (!issuer) {
      throw new ConfigError("MCP_AUTH requires MCP_OIDC_ISSUER");
    }
    if (!resourceUrl) {
      throw new ConfigError("MCP_AUTH requires MCP_RESOURCE_URL");
    }
  }

  return {
    enabled,
    issuer,
    userinfoUrl,
    jwksUrl,
    audience,
    resourceUrl,
    allowedSubjects,
  };
}
