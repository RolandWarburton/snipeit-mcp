# snipeit-mcp-deno

Deno-native TypeScript port of the Snipe-IT MCP server, built on
[`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk).

**API-key mode only** - authenticates to Snipe-IT with a single static
`SNIPEIT_TOKEN`. No OAuth, no Express: HTTP transport is served by `Deno.serve`
+ the SDK's web-standard streamable-HTTP transport.

**Targets Snipe-IT v8.7.x.** Every endpoint is verified against `routes/api.php`
at tag `v8.7.2`. One tool needs v8.7 specifically - `asset_maintenance` create,
which requires the `maintenance_type_id` introduced there; everything else also
works against v8.3.x.

## Status

| Module            | Tools | Ported |
| ----------------- | :---: | :----: |
| system            |   3   |   ✅   |
| assets            |   7   |   ✅   |
| foundational      |   8   |   ✅   |
| people            |   5   |   ✅   |
| inventory         |   5   |   ✅   |
| licenses          |   3   |   ✅   |
| reports           |   3   |   ✅   |
| custom_fields     |   2   |   ✅   |
| imports           |   1   |   ✅   |

See [`TESTING.md`](./TESTING.md) for the test suite (290 tests) and the live
smoke test, and [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the code layout and how
this port maps to the Python original.

## Run

```sh
export SNIPEIT_URL=https://your-snipeit.example.com
export SNIPEIT_TOKEN=your-token

# stdio (default) - for local MCP clients
deno task start

# streamable HTTP on Deno.serve
MCP_TRANSPORT=http MCP_PORT=8080 deno task start
```

Type-check: `deno task check`

## Environment variables

All configuration is environment-driven (parsed in `src/config.ts`; the OAuth
gate in `src/auth.ts`). `.env.example` is a copy-paste starting point.

Boolean vars accept `1`, `true`, `yes`, or `on` (case-insensitive); anything
else — including unset — is false. Comma-separated vars are trimmed and empties
dropped.

### Snipe-IT connection (required)

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `SNIPEIT_URL` | ✅ | — | Base URL of the Snipe-IT instance. Trailing slashes stripped; the client appends `/api/v1/`. |
| `SNIPEIT_TOKEN` | ✅ | — | Static Snipe-IT personal-access token. Sent as `Authorization: Bearer` on **every** upstream request — this is the only upstream credential (API-key mode). |

### Transport

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MCP_TRANSPORT` | | `stdio` | `stdio` or `http`. Invalid values fail fast. |
| `MCP_HOST` | | `127.0.0.1` | Bind address (http only). Set `0.0.0.0` to accept external connections. |
| `MCP_PORT` | http only | — | Listen port (http only). Must be an integer in 1–65535. Required when `MCP_TRANSPORT=http`; ignored for stdio. |

### Deployment (`docker compose` only)

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MCP_DOMAIN` | compose only | — | Public domain, read from `./.env` by Compose to build the Traefik router label (`Host(\`snipeit-mcp.${MCP_DOMAIN}\`)`). Not read by the server itself; `docker compose up` fails fast if it is unset. |

### Tool exposure

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `SNIPEIT_ALLOWED_TOOLS` | | *(all 37)* | Comma-separated whitelist of tool names to register. Unset ⇒ every tool is exposed. e.g. `system_info,manage_assets`. |

### OAuth gate (HTTP transport only)

Guards the inbound `/mcp` endpoint; **has no effect on stdio** (setting
`MCP_AUTH=true` with `MCP_TRANSPORT=stdio` is a fatal config error). This is a
gate, not an identity system — every authorized caller still shares the one
`SNIPEIT_TOKEN` upstream. See the [Remote access](#remote-access---claudeai-custom-connector-oauth)
section for the full flow.

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MCP_AUTH` | | `false` | Master switch for the gate. When true, requires `http` transport plus `MCP_OIDC_ISSUER` and `MCP_RESOURCE_URL`. |
| `MCP_OIDC_ISSUER` | when `MCP_AUTH` | — | OIDC issuer advertised in Protected Resource Metadata. Trailing slashes stripped; used to derive the userinfo/JWKS endpoints. |
| `MCP_RESOURCE_URL` | when `MCP_AUTH` | — | Canonical resource id advertised in PRM (the public `/mcp` URL). |
| `MCP_ALLOWED_SUBS` | | *(any valid token)* | Comma-separated allow-list of `sub`/`email`. A validated token whose subject isn't listed gets **403**. Unset ⇒ any validly-authenticated caller passes. |
| `MCP_OIDC_USERINFO_URL` | | `${MCP_OIDC_ISSUER}/userinfo` | Userinfo endpoint for opaque-token introspection (userinfo mode — the default when JWKS is unset). |

**Local JWKS validation (opt-in).** When set, tokens are validated locally as
signed RS256 JWTs against the issuer's cached keys instead of calling userinfo
per request — no round-trip, survives brief issuer outages; trade-off: a revoked
token stays valid until its `exp`.

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MCP_OIDC_JWKS` | | `false` | When true (and no explicit URL below), derive the JWKS endpoint as `${MCP_OIDC_ISSUER}/keys`. |
| `MCP_OIDC_JWKS_URL` | | — | Explicit JWKS endpoint. Overrides the derived one. Set either this or `MCP_OIDC_JWKS` to enter JWKS mode; otherwise the gate stays in userinfo mode. |
| `MCP_OIDC_AUDIENCE` | | *(unchecked)* | If set, require the JWT `aud` to equal this (the client id). Only meaningful in JWKS mode. Confirm the issuer stamps this on the **access** token, or every request 401s. |

### Smoke script only

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `SNIPEIT_URL_OVERRIDE` | | `https://snipeit.example.com` | Read only by `scripts/live-smoke.ts` to pin a host-reachable Snipe-IT URL (the container's internal `http://snipeit` is unreachable from the host). The smoke subprocess also forces `MCP_TRANSPORT=stdio` and `MCP_AUTH=false` regardless of `.env`. |

## Testing

`deno task test` runs the offline suites; `deno task smoke` runs a live
read-only smoke test over stdio. Details, single-test invocation, and the test
harness: [`TESTING.md`](./TESTING.md).

## Remote access - claude.ai custom connector (OAuth)

The public HTTP endpoint can be gated behind an OIDC provider - this deployment
uses **Dex** - so it can be added to claude.ai as a **browser custom connector**
(which only supports OAuth or no-auth). Nothing here is Dex-specific: any issuer
serving OIDC discovery and `userinfo` works.

The gate is a *gate, not an identity system*: every authorized caller still shares
the one static `SNIPEIT_TOKEN` upstream. Access is restricted by `MCP_ALLOWED_SUBS`,
matched against the token's `sub` **or** `email` claim.

### Server config (`.env`)

Enable it by setting these (HTTP transport only; see `.env.example`):

```sh
MCP_AUTH=true
MCP_OIDC_ISSUER=https://auth.example.com
MCP_RESOURCE_URL=https://snipeit-mcp.example.com/mcp
MCP_ALLOWED_SUBS=you@example.com         # optional but recommended; userinfo `sub` or `email`
```

then `docker compose up -d --build`. The server now serves RFC 9728 Protected
Resource Metadata at `/.well-known/oauth-protected-resource` and challenges
unauthenticated `/mcp` requests with `401 + WWW-Authenticate`, introspecting bearer
tokens via the issuer's `userinfo` endpoint.

#### Optional: local JWKS validation

When the issuer's access tokens are **signed JWTs** (Dex issues these), the server can
validate them locally against the issuer's public keys instead of calling
`userinfo` on every cache miss. Opt in with:

```sh
MCP_OIDC_JWKS=true            # derive the JWKS endpoint as ${MCP_OIDC_ISSUER}/keys
# MCP_OIDC_JWKS_URL=...       # or set the JWKS endpoint explicitly (overrides the derived one)
# MCP_OIDC_AUDIENCE=snipeit-mcp   # optional; if set, require the JWT `aud` to equal this
```

Absent these, the server stays in `userinfo` mode (the default). The keys are
fetched once and cached, so validation is CPU-only per request and keeps working
through brief issuer outages. It verifies the RS256 signature plus `iss`, `exp`,
and - when `MCP_OIDC_AUDIENCE` is set - `aud`; the `MCP_ALLOWED_SUBS` check is
unchanged.

**Trade-off:** local validation trusts the signature and `exp`, so a revoked
token stays valid until it expires (vs. ≤60 s in `userinfo` mode, where the cache
re-asks the issuer). Restarting the container still flushes the cache.

**Before setting `MCP_OIDC_AUDIENCE`:** confirm the issuer actually stamps that
`aud` on the *access* token (some put the client id only on the ID token). If it
doesn't match, every request 401s. Signature + `iss` + `exp` already gate access
without it.

### Add the connector in claude.ai

Prerequisite: a **public (PKCE) client** registered at the issuer, whose redirect
URI is exactly `https://claude.ai/api/mcp/auth_callback`. In Dex that is a
`staticClients` entry with `public: true`; Dex has no dynamic client registration,
so the client id must be entered by hand in step 3.

1. **Settings → Connectors → Add custom connector.**
2. **URL:** `https://snipeit-mcp.example.com/mcp`
3. **Advanced settings → Client ID:** the client id registered above (e.g.
   `snipeit-mcp`). Leave **Client Secret blank** - it is a public client (PKCE).
4. Claude redirects to the issuer; **log in as a user listed in
   `MCP_ALLOWED_SUBS`** and consent.
5. On success the 37 tools appear in the connector.

The OAuth discovery chain Claude walks:

```
GET /mcp (no token) → 401 + WWW-Authenticate
  → GET /.well-known/oauth-protected-resource  (authorization_servers → MCP_OIDC_ISSUER)
  → GET <issuer>/.well-known/openid-configuration
  → browser authorize + token (auth code + PKCE) → opaque access token
  → POST /mcp with Bearer <token>  →  server introspects via userinfo → 200
```

### Troubleshooting

`src/auth.ts` logs one line per decision to stderr (`[snipeit-mcp][auth] …`); watch
with `docker compose logs -f snipeit-mcp`:

| Symptom | Log line | Fix |
| --- | --- | --- |
| Works | `authorized sub=…` | - |
| 403 after login | `sub=<x> … not in allowed set → 403` | set `MCP_ALLOWED_SUBS` to the real `sub` |
| 401 with a token | `userinfo rejected token (HTTP 401)` | token/issuer mismatch; recheck `MCP_OIDC_ISSUER` |
| Flow stalls, no `[auth]` line | *(none)* | upstream: redirect-URI mismatch at the issuer, or RFC 8707 resource-indicator handling (may need an `/.well-known/oauth-authorization-server` shim) |

## Development

Code layout, the tool-module pattern, how to add a tool, and the port's fidelity
to the Python original: [`DEVELOPMENT.md`](./DEVELOPMENT.md).
