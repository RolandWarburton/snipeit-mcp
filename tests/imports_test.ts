/**
 * Tests for the imports module - port of the manage_imports tests in
 * test_admin.py plus the upload bearer-token regression from test_file_transfers.py.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { importsTools } from "../src/tools/imports.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(importsTools(makeClient()));
const OK = { json: { status: "success" } };

Deno.test("manage_imports list → count 2", async () => {
  await withStub([{ json: { rows: [{ id: 1, filename: "assets.csv" }, { id: 2, filename: "users.csv" }] } }], async () => {
    const r = await callTool(tools.manage_imports, { action: "list" });
    assertEquals(r.success, true);
    assertEquals(r.count, 2);
  });
});

Deno.test("manage_imports get → GET imports/1", async () => {
  await withStub([{ json: { id: 1, filename: "assets.csv" } }], async (cap) => {
    assertEquals((await callTool(tools.manage_imports, { action: "get", import_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/imports/1"]);
  });
});

Deno.test("manage_imports get missing id", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_imports, { action: "get" });
    assertEquals(r.success, false);
    assertStringIncludes(String(r.error), "import_id");
  });
});

Deno.test("manage_imports upload missing path", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_imports, { action: "upload" });
    assertEquals(r.success, false);
    assertStringIncludes(String(r.error), "file_path");
  });
});

Deno.test("manage_imports update → PATCH imports/1", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.manage_imports, { action: "update", import_id: 1, import_data: { import_type: "asset" } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["PATCH", "/api/v1/imports/1"]);
  });
});

Deno.test("manage_imports update missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_imports, { action: "update", import_data: { import_type: "asset" } })).success, false));
});

Deno.test("manage_imports delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_imports, { action: "delete", import_id: 1 })).success, true));
});

Deno.test("manage_imports delete missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_imports, { action: "delete" })).success, false));
});

Deno.test("manage_imports process → POST imports/process/1", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.manage_imports, { action: "process", import_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/imports/process/1"]);
  });
});

Deno.test("manage_imports process missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_imports, { action: "process" })).success, false));
});

Deno.test("manage_imports upload → POST imports with bearer token", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".csv" });
  await Deno.writeTextFile(tmp, "asset_tag,name\nA1,Laptop\n");
  try {
    await withStub([{ json: { id: 12 } }], async (cap) => {
      assertEquals((await callTool(tools.manage_imports, { action: "upload", file_path: tmp })).success, true);
      assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/imports"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
    });
  } finally {
    await Deno.remove(tmp);
  }
});
