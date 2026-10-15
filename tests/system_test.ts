/**
 * Tests for the system module - port of the system_info / manage_backups /
 * ldap_operations tests in test_admin.py, plus the backup-download bearer-token
 * regression from test_file_transfers.py.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { systemTools } from "../src/tools/system.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(systemTools(makeClient()));
const OK = { json: { status: "success" } };

Deno.test("system_info → GET version", async () => {
  await withStub([{ json: { version: "6.1.0", php_version: "8.1.0" } }], async (cap) => {
    const r = await callTool(tools.system_info, {});
    assertEquals(r.success, true);
    assertEquals("version_info" in r, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/version"]);
  });
});

Deno.test("manage_backups list", async () => {
  await withStub([{ json: { rows: [{ filename: "backup.sql" }] } }], async () => {
    assertEquals((await callTool(tools.manage_backups, { action: "list" })).success, true);
  });
});

Deno.test("manage_backups download missing filename", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_backups, { action: "download" })).success, false));
});

Deno.test("manage_backups download missing save_path", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_backups, { action: "download", filename: "backup.sql" })).success, false));
});

Deno.test("manage_backups download → GET settings/backups/download/<file> with bearer", async () => {
  const tmp = await Deno.makeTempFile();
  try {
    await withStub([{ bytes: new TextEncoder().encode("sql-dump") }], async (cap) => {
      const r = await callTool(tools.manage_backups, { action: "download", filename: "backup.sql", save_path: tmp });
      assertEquals(r.success, true);
      assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/settings/backups/download/backup.sql"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
      assertEquals(new TextDecoder().decode(await Deno.readFile(tmp)), "sql-dump");
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("ldap_operations sync → POST users/ldapsync", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.ldap_operations, { action: "sync" });
    assertEquals(r.success, true);
    assertEquals(r.action, "sync");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/users/ldapsync"]);
  });
});

Deno.test("ldap_operations test → GET settings/ldaptest", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.ldap_operations, { action: "test" });
    assertEquals(r.success, true);
    assertEquals(r.action, "test");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/settings/ldaptest"]);
  });
});

// Cross-cutting error mapping (from test_error_handling.py)
Deno.test("system_info 401 → authentication error", async () => {
  await withStub([{ status: 401, json: {} }], async () => {
    const r = await callTool(tools.system_info, {});
    assertEquals(r.success, false);
    assertStringIncludes(String(r.error).toLowerCase(), "authentication");
  });
});
