/**
 * OAuth gate for the HTTP transport (see README "Remote access").
 *
 * This is a *gate*, not an identity system: Claude relays an issuer-minted
 * access token, and we validate it in one of two modes:
 *   - userinfo (default): treat the token as opaque and introspect it by
 *     calling the issuer's `userinfo` endpoint.
 *   - local JWKS (opt-in via config.jwksUrl): the token is a signed JWT, so
 *     verify its RS256 signature against the issuer's cached keys and check
 *     iss/exp/aud locally - no per-request round-trip.
 * Both modes converge on the same `#checkSubject` allowlist and cache. On
 * success every caller still shares the one static SNIPEIT_TOKEN upstream - the
 * gate only answers "may this caller reach the MCP at all?".
 *
 * Nothing here touches the stdio path; auth applies only when transport==="http"
 * and MCP_AUTH is enabled.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthConfig } from "./config.ts";

/** Claims returned by the OIDC userinfo endpoint (only sub/email are used). */
export interface UserinfoClaims {
  sub?: string;
  email?: string;
  [k: string]: unknown;
}

export type AuthResult =
  | { ok: true; claims: UserinfoClaims }
  /** 401: no/invalid token - respond with a WWW-Authenticate challenge. */
  | { ok: false; status: 401 }
  /** 403: valid token but the subject is not in allowedSubjects. */
  | { ok: false; status: 403 };

/** Positive-validation cache TTL. Access tokens live longer, but a short window
 * bounds staleness (and, in userinfo mode, the revocation lag) while still
 * collapsing bursts to a single validation. */
const CACHE_TTL_MS = 60_000;
/** Guard against unbounded growth if many distinct tokens are seen. */
const CACHE_MAX_ENTRIES = 1_000;

/** A raw bearer resolved to claims, before the subject allowlist check.
 * `tokenExp` (epoch ms) is known for JWTs and bounds the positive-cache TTL. */
type Introspection = { claims: UserinfoClaims; tokenExp?: number } | null;

export class Authenticator {
  readonly #cfg: AuthConfig;
  /** token → validated claims + expiry. Positive results only; never cached on failure. */
  readonly #cache = new Map<string, { claims: UserinfoClaims; exp: number }>();
  /** Cached remote JWKS resolver; present only in local-validation mode. */
  readonly #jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(cfg: AuthConfig) {
    this.#cfg = cfg;
    this.#jwks = cfg.jwksUrl
      ? createRemoteJWKSet(new URL(cfg.jwksUrl))
      : undefined;
  }

  /** RFC 9728 Protected Resource Metadata body (served unauthenticated).
   * `authorization_servers` points straight at the issuer - Claude does PKCE on
   * its own and falls back to the issuer's openid-configuration for AS metadata,
   * so no shim is needed. */
  protectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: this.#cfg.resourceUrl,
      authorization_servers: [this.#cfg.issuer],
    };
  }

  /** Absolute URL of our PRM document, derived from the resource origin. */
  #prmUrl(): string {
    return new URL(
      "/.well-known/oauth-protected-resource",
      this.#cfg.resourceUrl,
    ).href;
  }

  /** WWW-Authenticate value that triggers the client's discovery of the AS. */
  challengeHeader(): string {
    return `Bearer resource_metadata="${this.#prmUrl()}"`;
  }

  /** Validate the request's bearer token, using the cache before either the
   * local JWKS check (if configured) or a userinfo round-trip. */
  async authorize(req: Request): Promise<AuthResult> {
    const token = this.#bearer(req);
    if (!token) {
      return { ok: false, status: 401 };
    }

    const now = Date.now();
    const cached = this.#cache.get(token);
    if (cached) {
      if (cached.exp > now) {
        return this.#checkSubject(cached.claims);
      }
      this.#cache.delete(token); // lazy eviction of the stale entry
    }

    const introspected = this.#jwks
      ? await this.#verifyJwt(token)
      : await this.#viaUserinfo(token);
    if (!introspected) {
      return { ok: false, status: 401 };
    }

    this.#store(token, introspected.claims, now, introspected.tokenExp);
    return this.#checkSubject(introspected.claims);
  }

  /** Extract a non-empty bearer token from the Authorization header, or null. */
  #bearer(req: Request): string | null {
    const header = req.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) return null;
    return match[1].trim() || null;
  }

  /** Local RS256 validation against the issuer's cached JWKS. jose fetches the
   * keys once and caches them, so steady state is CPU-only - no per-request
   * round-trip, and validation keeps working through brief issuer blips. Checks
   * signature, iss, exp/nbf, and - if `audience` is set - aud. Any failure is an
   * opaque 401 (we never leak *why* a token was rejected). */
  async #verifyJwt(token: string): Promise<Introspection> {
    try {
      const { payload } = await jwtVerify(token, this.#jwks!, {
        issuer: this.#cfg.issuer,
        audience: this.#cfg.audience, // undefined ⇒ jose skips the aud check
        algorithms: ["RS256"],
      });
      const claims: UserinfoClaims = {
        ...payload,
        sub: payload.sub,
        email: typeof payload.email === "string" ? payload.email : undefined,
      };
      const tokenExp = typeof payload.exp === "number"
        ? payload.exp * 1000 // JWT exp is seconds; the cache works in ms
        : undefined;
      return { claims, tokenExp };
    } catch {
      return null;
    }
  }

  /** Introspect an opaque token by calling the issuer's userinfo endpoint. */
  async #viaUserinfo(token: string): Promise<Introspection> {
    let res: Response;
    try {
      res = await fetch(this.#cfg.userinfoUrl!, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
    } catch {
      // Issuer unreachable - treat as unauthenticated rather than 500.
      return null;
    }

    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }

    try {
      return { claims: await res.json() as UserinfoClaims };
    } catch {
      return null;
    }
  }

  #checkSubject(claims: UserinfoClaims): AuthResult {
    const allow = this.#cfg.allowedSubjects;
    if (allow && allow.size > 0) {
      const permitted = (claims.sub !== undefined && allow.has(claims.sub)) ||
        (claims.email !== undefined && allow.has(claims.email));
      if (!permitted) {
        return { ok: false, status: 403 };
      }
    }
    return { ok: true, claims };
  }

  /** Cache a positive result. Expiry is `min(tokenExp, now + TTL)` so a JWT
   * that expires within the window is never served stale from cache. */
  #store(
    token: string,
    claims: UserinfoClaims,
    now: number,
    tokenExp?: number,
  ): void {
    if (this.#cache.size >= CACHE_MAX_ENTRIES) this.#prune(now);
    const exp = tokenExp !== undefined
      ? Math.min(tokenExp, now + CACHE_TTL_MS)
      : now + CACHE_TTL_MS;
    this.#cache.set(token, { claims, exp });
  }

  /** Drop expired entries; if still full, clear outright (single-user scale). */
  #prune(now: number): void {
    for (const [token, entry] of this.#cache) {
      if (entry.exp <= now) this.#cache.delete(token);
    }
    if (this.#cache.size >= CACHE_MAX_ENTRIES) this.#cache.clear();
  }
}
