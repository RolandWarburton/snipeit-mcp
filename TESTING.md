# Testing

Two layers: the offline `Deno.test` suites (no network, no credentials) and a
live read-only smoke test against a real Snipe-IT.

## Test suite

`deno task test` runs the `Deno.test` suites under `tests/` — **290 tests, all
passing**, the full migration of the Python suite plus the v8.7.2 endpoint
corrections. Tests drive the real tool
handlers against a stubbed `globalThis.fetch` (see `tests/_harness.ts`) and
assert on the exact HTTP request produced — method, URL path, query, JSON body,
and bearer header — a stronger check than the Python suite, which mocked at the
client layer.

Tests need **no** Snipe-IT credentials or network; the stub captures every
request in-process.

```sh
deno task test                        # all suites (bundles the --allow-* flags)

# a single suite / a single test — pass the flags yourself when calling `deno test` directly:
deno test tests/assets_test.ts --allow-read --allow-write --allow-net --allow-env
deno test --filter "checkout" tests/assets_test.ts --allow-read --allow-write --allow-net --allow-env
```

Use the harness helpers rather than calling handlers directly
(`tests/_harness.ts`): `makeClient()` for a client pointed at the test URL,
`withStub(responses, fn)` to swap in the recording `fetch`, and
`callTool(tool, args)` which parses args through the tool's own zod
`inputSchema` first (matching the SDK) before invoking the handler.

| Suite | Covers | Python source |
| ----- | ------ | ------------- |
| `assets_test.ts` | 7 asset tools | test_assets.py |
| `foundational_test.ts` | categories/mfrs/models/status/locations/suppliers/depreciations/model_files | test_configuration.py, test_admin.py |
| `people_test.ts` | users, companies, departments, groups, 2FA | test_users_org.py |
| `inventory_test.ts` | consumables, components, accessories (+ops) | test_inventory.py |
| `licenses_test.ts` | licenses, seats, files | test_licensing.py, test_file_transfers.py |
| `reports_test.ts` | activity, status, audit (+ error mapping) | test_admin.py, test_error_handling.py |
| `system_test.ts` | system_info, backups, ldap | test_admin.py, test_file_transfers.py |
| `custom_fields_test.ts` | fields, fieldsets | test_custom_fields.py |
| `imports_test.ts` | CSV import workflow | test_admin.py, test_file_transfers.py |
| `schemas_test.ts` | zod schema validation | test_models.py |
| `server_test.ts` | tool registration + whitelist (in-memory client) | test_core.py |
| `config_test.ts` | env/transport parsing | (new) |

`test_auth.py` is **N/A** — OAuth was removed in this API-key-only port.

## Live smoke test

A scripted read-only smoke test over stdio, using the official MCP SDK client
(no mocks). `StdioClientTransport` spawns its **own** `deno run src/main.ts`
subprocess — separate from any running Docker container — and drives it end to
end: real entry point, config load, transport, and `client.ts` against a live
Snipe-IT.

```sh
deno task smoke   # SDK client spawns src/main.ts, runs system_info + asset list
```

Only read-only tools are called; nothing mutates Snipe-IT. The subprocess forces
`MCP_TRANSPORT=stdio` and `MCP_AUTH=false` (the OAuth gate is HTTP-only), and
pins `SNIPEIT_URL` to a host-reachable address — the container's internal
`http://snipeit` is unreachable from the host. Override it with
`SNIPEIT_URL_OVERRIDE=...` (default `https://snipeit.example.com`);
`SNIPEIT_TOKEN` still flows through from `--env-file=.env`.

## Remaining before production

Run the write paths against a real write-capable Snipe-IT instance to confirm
request/response bodies — the one thing the stubbed suite can't verify.
