# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Deno-native TypeScript MCP server for Snipe-IT, ported from a Python
(FastMCP + `snipeit-python-api`) original. It exposes 37 tools across 9 modules,
built on `@modelcontextprotocol/sdk`. **API-key mode only**: it authenticates to
Snipe-IT with one static `SNIPEIT_TOKEN` shared by every request; there is no
per-user identity upstream.

## Commands

```sh
deno task check          # type-check (deno check src/main.ts) — run before considering work done
deno task test           # run all Deno.test suites under tests/
deno task start          # run the server (stdio transport by default)
deno task dev            # run with --watch
deno task smoke          # read-only live smoke test over stdio (needs .env with real creds)

deno test tests/assets_test.ts                    # a single suite
deno test --allow-read --allow-write --allow-net --allow-env --filter "checkout" tests/assets_test.ts
```

`deno task test` already includes the `--allow-*` flags; only pass them when
invoking `deno test` directly on a file.

Requires env `SNIPEIT_URL` and `SNIPEIT_TOKEN` to actually run (`.env.example`
documents all vars; `deno task smoke` loads `.env`). Tests do **not** need
these — they stub `fetch`.

## Architecture

Startup flow (`src/main.ts`): `loadConfig()` → `new SnipeITClient()` →
`buildServer()` → connect a transport. Fail-fast on config errors (exit 2).

- **`src/config.ts`** — all env parsing. `SNIPEIT_*` for creds, `MCP_TRANSPORT`
  (`stdio`|`http`) / `MCP_HOST` / `MCP_PORT`, `SNIPEIT_ALLOWED_TOOLS` (whitelist),
  and the `MCP_AUTH`/`MCP_OIDC_*` OAuth-gate vars. Returns a validated `Config`.
- **`src/client.ts`** — `SnipeITClient`, a thin `fetch` wrapper over
  `${baseUrl}/api/v1/`. Maps HTTP status → typed errors
  (`SnipeITNotFoundError` 404, `SnipeITAuthenticationError` 401,
  `SnipeITValidationError` 422, `SnipeITError` other). `listPage()` returns
  `[rows, total]`; `paginationMeta()` and `HARDWARE_STANDARD_FIELDS` live here too.
- **`src/tool.ts`** — the `ToolDef` shape (`name`, `description`, `inputSchema`
  as a zod raw shape, `annotations`, `handler`) plus two helpers every tool uses:
  `jsonResult()` (serializes the return value to text content) and `guarded(name, fn)`
  (catches the typed client errors and returns `{ success: false, error }`
  payloads instead of throwing).
- **`src/tools/*.ts`** — one file per module, each exporting a factory
  `<name>Tools(client): ToolDef[]`. This is where handlers live.
- **`src/schemas.ts`** — zod schemas (port of the Python pydantic `schemas.py`),
  imported by tool modules for structured params like `asset_data`.
- **`src/util.ts`** — shared helpers: `listParams`/`listArgs` (the standard
  pagination inputs), `pick`, `compact` (drop null/undefined keys, i.e. Python's
  `model_dump` + None filter), `payloadOf` (unwraps Snipe-IT's
  `{status, messages, payload}` responses), `basename`, `ensureDir`.
- **`src/server.ts`** — `buildServer()` spreads every module's factory into one
  `defs` array and registers each, skipping any name not in the
  `SNIPEIT_ALLOWED_TOOLS` whitelist.
- **`src/auth.ts`** — the optional OAuth gate (HTTP transport only). It is a
  gate, not an identity system: it introspects a bearer token via the OIDC
  issuer's `userinfo` endpoint (or validates a signed JWT locally against JWKS
  when `MCP_OIDC_JWKS*` is set), optionally restricting to `MCP_ALLOWED_SUBS`.
  All authorized callers still share the one `SNIPEIT_TOKEN`.

### Transports

- **stdio** (default): one `McpServer` + `StdioServerTransport`. stdout is
  reserved for the JSON-RPC stream — **all diagnostics go to stderr**
  (`console.error`, prefixed `[snipeit-mcp]`). Never `console.log`.
- **http**: `Deno.serve` routes `/mcp` to the SDK's
  `WebStandardStreamableHTTPServerTransport` in **stateless mode** — a fresh
  server + transport are built per request (the transport rejects reuse). The
  OAuth gate, when enabled, wraps every `/mcp` method and serves RFC 9728
  Protected Resource Metadata at `/.well-known/oauth-protected-resource`.
  `GET /health` is unauthenticated and process-local (it makes no Snipe-IT
  call) — it backs the container healthcheck.

## Testing conventions

Tests drive the **real** tool handlers against a stubbed `globalThis.fetch`
(`tests/_harness.ts`) and assert on the exact HTTP request produced — method,
URL path, query string, JSON body, and bearer header. This is stricter than the
Python suite (which mocked at the client layer), so a passing test means the
wire request is byte-correct.

Use the harness helpers rather than calling handlers directly:

- `makeClient()` — a `SnipeITClient` pointed at `TEST_URL`.
- `withStub(responses, async (captured) => {...})` — swaps in the stub fetch,
  queues the given responses, restores afterward. `captured` records each request.
- `callTool(tool, args)` — parses `args` through the tool's own zod `inputSchema`
  first (so defaults/coercion match the SDK exactly), invokes the handler, and
  returns the parsed JSON result. Always route calls through this, not the raw
  handler.

## Adding a tool module

1. Create `src/tools/<name>.ts` exporting `<name>Tools(client): ToolDef[]`.
2. Per tool: pydantic/`Annotated` params → a zod raw shape in `inputSchema`
   (reuse `listParams`/`listArgs` and `src/schemas.ts` where they fit); the body
   goes in `handler`, wrapped in `guarded(name, ...)`. Return the result object
   directly — `guarded` serializes it.
3. Spread `...<name>Tools(client)` into `defs` in `src/server.ts`.

## API target: Snipe-IT v8.7.2

Every endpoint was verified against `routes/api.php` at tag `v8.7.2`. When
changing a handler, check the route actually exists at that tag — several
endpoints the Python original used were already wrong (they 404'd), and v8.7
removed others outright:

- `users/two_factor_reset` is gone from the v1 API; the `user_two_factor` tool
  was removed with it and 2FA state is read-only (`two_factor_enrolled`).
- `locations/{id}/users` is gone; users are reached via `users?location_id=`.
- Maintenance creation moved to the flat `maintenances` resource and now
  requires `maintenance_type_id` (FK into the new `maintenance_types` table)
  instead of the free-text `asset_maintenance_type`. `asset_id` and
  `completion_date` still work as legacy aliases via model mutators.
- File attachments for every entity go through the generic
  `{object_type}/{id}/files` API (multipart, `file[]` parts, `/delete` suffix
  on the DELETE route). Entity *images* additionally accept a base64 `data:`
  URI in the JSON `image` field.
- Accessory and component check-in take the **checkout/join record id** in the
  path, not the accessory/component id.

## Fidelity to the Python original

This is a deliberate port; handlers mirror the Python tools' request shapes.
Endpoints for asset operations the Python code delegated to `snipeit-python-api`
(checkout/checkin/audit/restore, file up/download, labels, maintenance) were
copied **verbatim from that library's source**, so the HTTP surface matches
exactly. When changing a handler, preserve the request it emits unless you have
a reason to diverge — the tests pin these. State-changing ops return the raw
Snipe-IT API result rather than reconstructing the library's object, so some
response payloads intentionally differ in shape from the Python server.
