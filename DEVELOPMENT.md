# Development

## Commands

```sh
deno task check   # type-check (deno check src/main.ts)
deno task dev     # run with --watch (stdio by default)
deno task start   # run the server
deno task test    # run the test suites (see TESTING.md)
deno task smoke   # live read-only smoke test (see TESTING.md)
```

See [`README.md`](./README.md) for how to run the server and the full
environment-variable reference, and [`TESTING.md`](./TESTING.md) for the test
harness.

## Layout

```
src/
  main.ts          entry point: config → client → server → transport
  config.ts        env parsing (API-key mode, stdio/http selection)
  auth.ts          OAuth gate (HTTP only): userinfo / local-JWKS validation
  client.ts        fetch-based Snipe-IT client (port of SnipeITDirectAPI)
  schemas.ts       zod schemas (port of pydantic schemas.py)
  util.ts          shared helpers (compact, pick, listParams, payloadOf, ...)
  tool.ts          ToolDef shape + guarded() error->result wrapper
  server.ts        McpServer build + tool registration + whitelist
  tools/           system, assets, foundational, people, inventory,
                   licenses, reports, custom_fields, imports (37 tools)
```

Each tool module exports a factory `<name>Tools(client): ToolDef[]`. A `ToolDef`
carries `name`, `description`, an `inputSchema` (a zod raw shape), optional
`annotations`, and a `handler`. `server.ts` spreads every factory into one array
and registers each, skipping any name not in the `SNIPEIT_ALLOWED_TOOLS`
whitelist. Handlers are wrapped in `guarded(name, ...)` (`tool.ts`), which turns
the client's typed errors into `{ success: false, error }` result payloads.

The stdio transport reserves stdout for the JSON-RPC stream, so **all
diagnostics go to stderr** (`console.error`, prefixed `[snipeit-mcp]`) — never
`console.log`.

## Adding a tool module

1. Create `src/tools/<name>.ts` exporting `<name>Tools(client): ToolDef[]`.
2. Translate each Python tool: `Annotated`/pydantic params → a zod raw shape in
   `inputSchema` (reuse `listParams`/`listArgs` from `util.ts` and the schemas in
   `schemas.ts` where they fit); body → the `handler`, wrapped in
   `guarded(name, ...)`. Return the result object directly — `guarded` serializes
   it.
3. Spread `...<name>Tools(client)` into `defs` in `src/server.ts`.

## Fidelity to the Python original

This is a deliberate port; handlers mirror the Python tools' request shapes, and
the tests pin the exact wire request each one emits. Endpoints for asset
operations the Python code delegated to `snipeit-python-api`
(checkout/checkin/audit/restore, file up/download, labels, maintenance) were
taken **verbatim from that library's source**, so the HTTP surface matches
exactly. Preserve the emitted request when changing a handler unless you have a
reason to diverge. State-changing ops return the raw Snipe-IT API result rather
than reconstructing the library's object, so some response payloads intentionally
differ in shape from the Python server while carrying the same information.
