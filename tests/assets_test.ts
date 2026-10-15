/**
 * Tests for the assets module - port of tests/test_assets.py.
 *
 * Each test drives the real handler through a stubbed fetch and asserts on both
 * the returned result and the exact HTTP request(s) issued.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { assetsTools } from "../src/tools/assets.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(assetsTools(makeClient()));
const OK = { json: { status: "success", payload: {} } };

// ---------------------------------------------------------------------------
// manage_assets
// ---------------------------------------------------------------------------

Deno.test("manage_assets create → POST hardware with body", async () => {
  await withStub([{ json: { status: "success", payload: { id: 1, asset_tag: "LAP-001", name: "Test Laptop" } } }], async (cap) => {
    const r = await callTool(tools.manage_assets, {
      action: "create",
      asset_data: { status_id: 1, model_id: 5, name: "Test Laptop" },
    });
    assertEquals(r.success, true);
    assertEquals(r.action, "create");
    assertEquals(cap.length, 1);
    assertEquals(cap[0].method, "POST");
    assertEquals(cap[0].path, "/api/v1/hardware");
    assertEquals(cap[0].body, { status_id: 1, model_id: 5, name: "Test Laptop" });
  });
});

Deno.test("manage_assets create missing data → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_assets, { action: "create" });
    assertEquals(r.success, false);
  });
});

Deno.test("manage_assets create missing required fields → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_assets, { action: "create", asset_data: {} });
    assertEquals(r.success, false);
  });
});

Deno.test("manage_assets get by id → GET hardware/1", async () => {
  await withStub([{ json: { id: 1, name: "Test Asset" } }], async (cap) => {
    const r = await callTool(tools.manage_assets, { action: "get", asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "get");
    assertEquals(cap[0].method, "GET");
    assertEquals(cap[0].path, "/api/v1/hardware/1");
  });
});

Deno.test("manage_assets get by tag → GET hardware/bytag/LAP-001", async () => {
  await withStub([{ json: { id: 1, asset_tag: "LAP-001" } }], async (cap) => {
    const r = await callTool(tools.manage_assets, { action: "get", asset_tag: "LAP-001" });
    assertEquals(r.success, true);
    assertEquals(cap[0].path, "/api/v1/hardware/bytag/LAP-001");
  });
});

Deno.test("manage_assets get by serial → GET hardware/byserial/ABC", async () => {
  await withStub([{ json: { rows: [{ id: 1, serial: "ABC" }], total: 1 } }], async (cap) => {
    const r = await callTool(tools.manage_assets, { action: "get", serial: "ABC" });
    assertEquals(r.success, true);
    assertEquals(cap[0].path, "/api/v1/hardware/byserial/ABC");
  });
});

Deno.test("manage_assets get missing id → error mentions required", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_assets, { action: "get" });
    assertEquals(r.success, false);
    assertStringIncludes(String(r.error).toLowerCase(), "required");
  });
});

Deno.test("manage_assets list → success", async () => {
  await withStub([{ json: { rows: [], total: 0 } }], async () => {
    const r = await callTool(tools.manage_assets, { action: "list" });
    assertEquals(r.success, true);
    assertEquals(r.action, "list");
  });
});

Deno.test("manage_assets list defaults sort=id order=asc", async () => {
  await withStub([{ json: { rows: [], total: 0 } }], async (cap) => {
    await callTool(tools.manage_assets, { action: "list" });
    assertEquals(cap[0].query.get("sort"), "id");
    assertEquals(cap[0].query.get("order"), "asc");
  });
});

Deno.test("manage_assets list with filters → query params", async () => {
  await withStub([{ json: { rows: [], total: 0 } }], async (cap) => {
    await callTool(tools.manage_assets, { action: "list", status_id: 1, model_id: 5, location_id: 10 });
    assertEquals(cap[0].query.get("status_id"), "1");
    assertEquals(cap[0].query.get("model_id"), "5");
    assertEquals(cap[0].query.get("location_id"), "10");
  });
});

Deno.test("manage_assets update → PATCH with payload from asset_data", async () => {
  await withStub([{ json: { status: "success", payload: { id: 1, name: "Updated" } } }], async (cap) => {
    const r = await callTool(tools.manage_assets, { action: "update", asset_id: 1, asset_data: { name: "Updated" } });
    assertEquals(r.success, true);
    assertEquals(r.action, "update");
    assertEquals(cap[0].method, "PATCH");
    assertEquals(cap[0].path, "/api/v1/hardware/1");
    assertEquals(cap[0].body, { name: "Updated" });
  });
});

Deno.test("manage_assets accepts plain-dict asset_data (schema coercion)", async () => {
  await withStub([{ json: { status: "success", payload: { id: 1, name: "Test Laptop" } } }], async (cap) => {
    const r = await callTool(tools.manage_assets, {
      action: "create",
      asset_data: { status_id: 1, model_id: 5, name: "Test Laptop" },
    });
    assertEquals(r.success, true);
    assertEquals(cap[0].body, { status_id: 1, model_id: 5, name: "Test Laptop" });
  });
});

Deno.test("manage_assets update with extra_fields → GET then PATCH validated payload", async () => {
  await withStub([
    { json: { id: 1, custom_fields: { Hostname: { field: "_snipeit_hostname_2" } } } },
    { json: { status: "success", payload: { id: 1, name: "Updated" } } },
  ], async (cap) => {
    const r = await callTool(tools.manage_assets, {
      action: "update",
      asset_id: 1,
      extra_fields: { _snipeit_hostname_2: "FL142" },
    });
    assertEquals(r.success, true);
    assertEquals(cap.length, 2);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/1"]);
    assertEquals([cap[1].method, cap[1].path], ["PATCH", "/api/v1/hardware/1"]);
    assertEquals(cap[1].body, { _snipeit_hostname_2: "FL142" });
  });
});

Deno.test("manage_assets update rejects unknown extra_field", async () => {
  await withStub([{ json: { id: 1, custom_fields: {} } }], async (cap) => {
    const r = await callTool(tools.manage_assets, {
      action: "update",
      asset_id: 1,
      extra_fields: { _snipeit_bogus: "x" },
    });
    assertEquals(r.success, false);
    assertStringIncludes(String(r.error), "Unknown fields");
    assertEquals(cap.length, 1); // only the validation GET, no PATCH
  });
});

Deno.test("manage_assets update missing id → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_assets, { action: "update", asset_data: { name: "X" } });
    assertEquals(r.success, false);
  });
});

Deno.test("manage_assets delete → DELETE hardware/1", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.manage_assets, { action: "delete", asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "delete");
    assertEquals([cap[0].method, cap[0].path], ["DELETE", "/api/v1/hardware/1"]);
  });
});

Deno.test("manage_assets delete missing id → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.manage_assets, { action: "delete" });
    assertEquals(r.success, false);
  });
});

// ---------------------------------------------------------------------------
// asset_operations
// ---------------------------------------------------------------------------

Deno.test("asset_operations checkout → POST checkout with assigned_user", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_operations, {
      action: "checkout",
      asset_id: 1,
      checkout_data: { checkout_to_type: "user", assigned_to_id: 10 },
    });
    assertEquals(r.success, true);
    assertEquals(r.action, "checkout");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/hardware/1/checkout"]);
    assertEquals(cap[0].body, { checkout_to_type: "user", assigned_user: 10 });
  });
});

Deno.test("asset_operations checkout missing data → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_operations, { action: "checkout", asset_id: 1 });
    assertEquals(r.success, false);
  });
});

Deno.test("asset_operations checkin → POST hardware/1/checkin", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_operations, { action: "checkin", asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/hardware/1/checkin"]);
  });
});

Deno.test("asset_operations audit → POST hardware/1/audit with note", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_operations, { action: "audit", asset_id: 1, audit_data: { note: "Audited" } });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/hardware/1/audit"]);
    assertEquals(cap[0].body, { note: "Audited" });
  });
});

Deno.test("asset_operations restore → POST hardware/1/restore", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_operations, { action: "restore", asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/hardware/1/restore"]);
  });
});

// ---------------------------------------------------------------------------
// asset_files
// ---------------------------------------------------------------------------

Deno.test("asset_files upload → POST hardware/1/files (multipart)", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".pdf" });
  await Deno.writeTextFile(tmp, "pdf-bytes");
  try {
    await withStub([{ json: { status: "success" } }], async (cap) => {
      const r = await callTool(tools.asset_files, { action: "upload", asset_id: 1, file_paths: [tmp] });
      assertEquals(r.success, true);
      assertEquals(r.action, "upload");
      assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/hardware/1/files"]);
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("asset_files upload missing paths → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_files, { action: "upload", asset_id: 1 });
    assertEquals(r.success, false);
  });
});

Deno.test("asset_files list → GET hardware/1/files", async () => {
  await withStub([{ json: { rows: [] } }], async (cap) => {
    const r = await callTool(tools.asset_files, { action: "list", asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/1/files"]);
  });
});

Deno.test("asset_files download → GET file and write save_path", async () => {
  const tmp = await Deno.makeTempFile();
  try {
    await withStub([{ bytes: new Uint8Array([1, 2, 3]) }], async (cap) => {
      const r = await callTool(tools.asset_files, { action: "download", asset_id: 1, file_id: 5, save_path: tmp });
      assertEquals(r.success, true);
      assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/1/files/5"]);
      assertEquals(await Deno.readFile(tmp), new Uint8Array([1, 2, 3]));
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("asset_files download missing file_id → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_files, { action: "download", asset_id: 1 });
    assertEquals(r.success, false);
  });
});

Deno.test("asset_files delete → DELETE .../files/5/delete (note the suffix)", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_files, { action: "delete", asset_id: 1, file_id: 5 });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["DELETE", "/api/v1/hardware/1/files/5/delete"]);
  });
});

Deno.test("asset_files delete missing file_id → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_files, { action: "delete", asset_id: 1 });
    assertEquals(r.success, false);
  });
});

// ---------------------------------------------------------------------------
// asset_labels
// ---------------------------------------------------------------------------

Deno.test("asset_labels by ids → resolves tags then POST hardware/labels", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".pdf" });
  try {
    await withStub([
      { json: { asset_tag: "LAP-001" } },
      { json: { asset_tag: "LAP-002" } },
      { json: { asset_tag: "LAP-003" } },
      { bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" },
    ], async (cap) => {
      const r = await callTool(tools.asset_labels, { asset_ids: [1, 2, 3], save_path: tmp });
      assertEquals(r.success, true);
      assertEquals(cap.slice(0, 3).map((c) => c.path), [
        "/api/v1/hardware/1", "/api/v1/hardware/2", "/api/v1/hardware/3",
      ]);
      assertEquals([cap[3].method, cap[3].path], ["POST", "/api/v1/hardware/labels"]);
      assertEquals(cap[3].body, { asset_tags: ["LAP-001", "LAP-002", "LAP-003"] });
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("asset_labels by tags → POST hardware/labels", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".pdf" });
  try {
    await withStub([{ bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }], async (cap) => {
      const r = await callTool(tools.asset_labels, { asset_tags: ["LAP-001", "LAP-002"], save_path: tmp });
      assertEquals(r.success, true);
      assertEquals(cap[0].body, { asset_tags: ["LAP-001", "LAP-002"] });
    });
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("asset_labels missing both → error", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_labels, {});
    assertEquals(r.success, false);
  });
});

// ---------------------------------------------------------------------------
// asset_maintenance
// ---------------------------------------------------------------------------

Deno.test("asset_maintenance create → POST maintenances with asset_id in body", async () => {
  await withStub([{ json: { payload: { id: 1 } } }], async (cap) => {
    const r = await callTool(tools.asset_maintenance, {
      action: "create",
      asset_id: 1,
      maintenance_data: {
        name: "RAM",
        maintenance_type_id: 3,
        start_date: "2026-09-01",
        supplier_id: 1,
      },
    });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/maintenances"]);
    assertEquals(cap[0].body, {
      asset_id: 1,
      name: "RAM",
      maintenance_type_id: 3,
      start_date: "2026-09-01",
      supplier_id: 1,
    });
  });
});

Deno.test("asset_maintenance create with optional cost", async () => {
  await withStub([{ json: { payload: { id: 2 } } }], async (cap) => {
    const r = await callTool(tools.asset_maintenance, {
      action: "create",
      asset_id: 1,
      maintenance_data: {
        name: "Screen fix",
        maintenance_type_id: 2,
        start_date: "2026-09-01",
        supplier_id: 2,
        cost: 150.0,
      },
    });
    assertEquals(r.success, true);
    assertEquals(cap[0].body, {
      asset_id: 1,
      name: "Screen fix",
      maintenance_type_id: 2,
      start_date: "2026-09-01",
      supplier_id: 2,
      cost: 150.0,
    });
  });
});

Deno.test("asset_maintenance list_types → GET maintenance-types", async () => {
  await withStub([{ json: { rows: [{ id: 1, name: "Repair", extra: "x" }] } }], async (cap) => {
    const r = await callTool(tools.asset_maintenance, { action: "list_types" });
    assertEquals(r.success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/maintenance-types"]);
    assertEquals(r.types, [{ id: 1, name: "Repair" }]);
  });
});

Deno.test("asset_maintenance create without maintenance_data errors", async () => {
  await withStub([], async () => {
    const r = await callTool(tools.asset_maintenance, { action: "create", asset_id: 1 });
    assertEquals(r.success, false);
  });
});

// ---------------------------------------------------------------------------
// asset_licenses
// ---------------------------------------------------------------------------

Deno.test("asset_licenses → GET hardware/1/licenses", async () => {
  await withStub([{ json: { rows: [] } }], async (cap) => {
    const r = await callTool(tools.asset_licenses, { asset_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.asset_id, 1);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/1/licenses"]);
  });
});

// ---------------------------------------------------------------------------
// asset_requests
// ---------------------------------------------------------------------------

Deno.test("asset_requests request (no data) → POST account/request/123, no body", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_requests, { action: "request", asset_id: 123 });
    assertEquals(r.success, true);
    assertEquals(r.action, "request");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/account/request/123"]);
    assertEquals(cap[0].body, undefined);
  });
});

Deno.test("asset_requests request with data → POST with note body", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_requests, { action: "request", asset_id: 123, request_data: { note: "Need it" } });
    assertEquals(r.success, true);
    assertEquals(cap[0].body, { note: "Need it" });
  });
});

Deno.test("asset_requests cancel → POST account/request/123/cancel", async () => {
  await withStub([OK], async (cap) => {
    const r = await callTool(tools.asset_requests, { action: "cancel", asset_id: 123 });
    assertEquals(r.success, true);
    assertEquals(r.action, "cancel");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/account/request/123/cancel"]);
  });
});
