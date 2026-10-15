/** Tests for the licenses module - port of tests/test_licensing.py. */

import { assertEquals } from "@std/assert";
import { licensesTools } from "../src/tools/licenses.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(licensesTools(makeClient()));
const OK = { json: { status: "success" } };
const EMPTY_LIST = { json: { rows: [], total: 0 } };

// --- manage_licenses ---

Deno.test("manage_licenses create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Office", seats: 10 } } }], async (cap) => {
    const r = await callTool(tools.manage_licenses, { action: "create", license_data: { name: "Office", seats: 10 } });
    assertEquals(r.success, true);
    assertEquals(r.action, "create");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/licenses"]);
  });
});

Deno.test("manage_licenses create missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "create" })).success, false);
  });
});

Deno.test("manage_licenses create missing required", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "create", license_data: {} })).success, false);
  });
});

Deno.test("manage_licenses get", async () => {
  await withStub([{ json: { id: 1, name: "Office", seats: 10 } }], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "get", license_id: 1 })).success, true);
  });
});

Deno.test("manage_licenses get missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "get" })).success, false);
  });
});

Deno.test("manage_licenses list → count 0", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.manage_licenses, { action: "list" });
    assertEquals(r.success, true);
    assertEquals(r.count, 0);
  });
});

Deno.test("manage_licenses update", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Updated" } } }], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "update", license_id: 1, license_data: { name: "Updated" } })).success, true);
  });
});

Deno.test("manage_licenses update missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "update", license_data: { name: "X" } })).success, false);
  });
});

Deno.test("manage_licenses delete", async () => {
  await withStub([{ json: {} }], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "delete", license_id: 1 })).success, true);
  });
});

Deno.test("manage_licenses delete missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.manage_licenses, { action: "delete" })).success, false);
  });
});

// --- license_seats ---

Deno.test("license_seats list → count 1", async () => {
  await withStub([{ json: { rows: [{ id: 1, name: "Seat 1" }], total: 1 } }], async (cap) => {
    const r = await callTool(tools.license_seats, { action: "list", license_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.count, 1);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/licenses/1/seats"]);
  });
});

Deno.test("license_seats list missing id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "list" })).success, false);
  });
});

Deno.test("license_seats checkout → PATCH licenses/1/seats/1", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.license_seats, { action: "checkout", license_id: 1, seat_id: 1, checkout_data: { assigned_to: 5 } });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["PATCH", "/api/v1/licenses/1/seats/1"]);
    assertEquals(cap[0].body, { assigned_to: 5 });
  });
});

Deno.test("license_seats checkout missing seat_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "checkout", license_id: 1, checkout_data: { assigned_to: 5 } })).success, false);
  });
});

Deno.test("license_seats checkout missing data", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "checkout", license_id: 1, seat_id: 1 })).success, false);
  });
});

Deno.test("license_seats checkout missing assigned target", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "checkout", license_id: 1, seat_id: 1, checkout_data: {} })).success, false);
  });
});

Deno.test("license_seats checkin → PATCH licenses/1/seats/1 with assigned_to null", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.license_seats, { action: "checkin", license_id: 1, seat_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["PATCH", "/api/v1/licenses/1/seats/1"]);
    assertEquals(cap[0].body, { assigned_to: null });
  });
});

Deno.test("license_seats checkin missing seat_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "checkin", license_id: 1 })).success, false);
  });
});

Deno.test("license_seats checkin missing license_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_seats, { action: "checkin", seat_id: 1 })).success, false);
  });
});

// --- license_files ---

Deno.test("license_files list → GET licenses/1/files", async () => {
  await withStub([{ json: { rows: [] } }], async (cap) => {
    assertEquals((await callTool(tools.license_files, { action: "list", license_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/licenses/1/files"]);
  });
});

Deno.test("license_files upload missing path", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_files, { action: "upload", license_id: 1 })).success, false);
  });
});

Deno.test("license_files download missing file_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_files, { action: "download", license_id: 1 })).success, false);
  });
});

Deno.test("license_files download missing save_path", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_files, { action: "download", license_id: 1, file_id: 1 })).success, false);
  });
});

Deno.test("license_files delete → DELETE licenses/1/files/5/delete", async () => {
  await withStub([{ json: {} }], async (cap) => {
    assertEquals((await callTool(tools.license_files, { action: "delete", license_id: 1, file_id: 5 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["DELETE", "/api/v1/licenses/1/files/5/delete"]);
  });
});

Deno.test("license_files delete missing file_id", async () => {
  await withStub([], async () => {
    assertEquals((await callTool(tools.license_files, { action: "delete", license_id: 1 })).success, false);
  });
});

// --- transfer regressions (bearer token + exact URL), from test_file_transfers.py ---

Deno.test("license_files upload → POST licenses/5/files with bearer", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".pdf" });
  await Deno.writeTextFile(tmp, "license-bytes");
  try {
    await withStub([{ json: { id: 3 } }], async (cap) => {
      assertEquals((await callTool(tools.license_files, { action: "upload", license_id: 5, file_path: tmp })).success, true);
      assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/licenses/5/files"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("license_files download → GET licenses/5/files/9 with bearer, writes file", async () => {
  const tmp = await Deno.makeTempFile();
  try {
    await withStub([{ bytes: new TextEncoder().encode("file-bytes") }], async (cap) => {
      assertEquals((await callTool(tools.license_files, { action: "download", license_id: 5, file_id: 9, save_path: tmp })).success, true);
      assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/licenses/5/files/9"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
      assertEquals(new TextDecoder().decode(await Deno.readFile(tmp)), "file-bytes");
    });
  } finally {
    await Deno.remove(tmp);
  }
});
