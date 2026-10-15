/**
 * Tests for the foundational module - port of tests/test_configuration.py
 * (categories/manufacturers/models/status_labels/locations/suppliers/
 * depreciations) plus model_files (test_admin.py + test_file_transfers.py).
 */

import { assertEquals } from "@std/assert";
import { foundationalTools } from "../src/tools/foundational.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(foundationalTools(makeClient()));
const OK = { json: { status: "success" } };
const EMPTY_LIST = { json: { rows: [], total: 0 } };
const REL_LIST = { json: { rows: [{ id: 1 }], total: 1 } };

// --- manage_categories ---
Deno.test("categories create → POST categories", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Laptops", category_type: "asset" } } }], async (cap) => {
    assertEquals((await callTool(tools.manage_categories, { action: "create", category_data: { name: "Laptops", category_type: "asset" } })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/categories"]);
  });
});
Deno.test("categories create missing data", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_categories, { action: "create" })).success, false));
});
Deno.test("categories get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_categories, { action: "get", category_id: 1 })).success, true));
});
Deno.test("categories list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_categories, { action: "list" })).success, true));
});
Deno.test("categories delete", async () => {
  await withStub([OK], async () => assertEquals((await callTool(tools.manage_categories, { action: "delete", category_id: 1 })).success, true));
});

// --- manage_manufacturers ---
Deno.test("manufacturers create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Dell" } } }], async () => assertEquals((await callTool(tools.manage_manufacturers, { action: "create", manufacturer_data: { name: "Dell" } })).success, true));
});
Deno.test("manufacturers create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_manufacturers, { action: "create", manufacturer_data: {} })).success, false));
});
Deno.test("manufacturers get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_manufacturers, { action: "get", manufacturer_id: 1 })).success, true));
});
Deno.test("manufacturers list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_manufacturers, { action: "list" })).success, true));
});
Deno.test("manufacturers delete", async () => {
  await withStub([OK], async () => assertEquals((await callTool(tools.manage_manufacturers, { action: "delete", manufacturer_id: 1 })).success, true));
});

// --- manage_models ---
Deno.test("models create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "XPS 15" } } }], async () => assertEquals((await callTool(tools.manage_models, { action: "create", model_data: { name: "XPS 15", category_id: 1 } })).success, true));
});
Deno.test("models create missing required", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_models, { action: "create", model_data: {} })).success, false));
});
Deno.test("models get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_models, { action: "get", model_id: 1 })).success, true));
});
Deno.test("models list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_models, { action: "list" })).success, true));
});
Deno.test("models update", async () => {
  await withStub([{ json: { payload: { id: 1 } } }], async () => assertEquals((await callTool(tools.manage_models, { action: "update", model_id: 1, model_data: { name: "Updated" } })).success, true));
});
Deno.test("models delete", async () => {
  await withStub([OK], async () => assertEquals((await callTool(tools.manage_models, { action: "delete", model_id: 1 })).success, true));
});
Deno.test("models assets → GET hardware?model_id=1", async () => {
  await withStub([REL_LIST], async (cap) => {
    const r = await callTool(tools.manage_models, { action: "assets", model_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "assets");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware"]);
    assertEquals(cap[0].query.get("model_id"), "1");
  });
});

// --- manage_status_labels ---
Deno.test("status_labels create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Deployed", type: "deployable" } } }], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "create", status_label_data: { name: "Deployed", type: "deployable" } })).success, true));
});
Deno.test("status_labels create missing required", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "create", status_label_data: {} })).success, false));
});
Deno.test("status_labels get", async () => {
  await withStub([{ json: { id: 1, name: "Deployed" } }], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "get", status_label_id: 1 })).success, true));
});
Deno.test("status_labels list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "list" })).success, true));
});
Deno.test("status_labels update", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Updated" } } }], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "update", status_label_id: 1, status_label_data: { name: "Updated" } })).success, true));
});
Deno.test("status_labels delete", async () => {
  await withStub([OK], async () => assertEquals((await callTool(tools.manage_status_labels, { action: "delete", status_label_id: 1 })).success, true));
});
Deno.test("status_labels assets → GET statuslabels/1/assetlist", async () => {
  await withStub([REL_LIST], async (cap) => {
    const r = await callTool(tools.manage_status_labels, { action: "assets", status_label_id: 1 });
    assertEquals(r.action, "assets");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/statuslabels/1/assetlist"]);
  });
});

// --- manage_locations ---
Deno.test("locations create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Office" } } }], async () => assertEquals((await callTool(tools.manage_locations, { action: "create", location_data: { name: "Office" } })).success, true));
});
Deno.test("locations create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_locations, { action: "create", location_data: {} })).success, false));
});
Deno.test("locations get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_locations, { action: "get", location_id: 1 })).success, true));
});
Deno.test("locations list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_locations, { action: "list" })).success, true));
});
Deno.test("locations delete", async () => {
  await withStub([OK], async () => assertEquals((await callTool(tools.manage_locations, { action: "delete", location_id: 1 })).success, true));
});
Deno.test("locations assets → GET locations/10/assets", async () => {
  await withStub([REL_LIST], async (cap) => {
    const r = await callTool(tools.manage_locations, { action: "assets", location_id: 10 });
    assertEquals(r.action, "assets");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/locations/10/assets"]);
  });
});
Deno.test("locations users → GET users?location_id=10", async () => {
  await withStub([REL_LIST], async (cap) => {
    const r = await callTool(tools.manage_locations, { action: "users", location_id: 10 });
    assertEquals(r.action, "users");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/users"]);
    assertEquals(cap[0].query.get("location_id"), "10");
  });
});

// --- manage_suppliers ---
Deno.test("suppliers create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "Acme" } } }], async () => assertEquals((await callTool(tools.manage_suppliers, { action: "create", supplier_data: { name: "Acme" } })).success, true));
});
Deno.test("suppliers create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_suppliers, { action: "create", supplier_data: {} })).success, false));
});
Deno.test("suppliers get", async () => {
  await withStub([{ json: { id: 1, name: "Acme" } }], async () => assertEquals((await callTool(tools.manage_suppliers, { action: "get", supplier_id: 1 })).success, true));
});
Deno.test("suppliers list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_suppliers, { action: "list" })).success, true));
});
Deno.test("suppliers delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_suppliers, { action: "delete", supplier_id: 1 })).success, true));
});

// --- manage_depreciations ---
Deno.test("depreciations create", async () => {
  await withStub([{ json: { payload: { id: 1, name: "3 Year" } } }], async () => assertEquals((await callTool(tools.manage_depreciations, { action: "create", depreciation_data: { name: "3 Year", months: 36 } })).success, true));
});
Deno.test("depreciations get", async () => {
  await withStub([{ json: { id: 1, name: "3 Year" } }], async () => assertEquals((await callTool(tools.manage_depreciations, { action: "get", depreciation_id: 1 })).success, true));
});
Deno.test("depreciations list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_depreciations, { action: "list" })).success, true));
});
Deno.test("depreciations update", async () => {
  await withStub([{ json: { payload: { id: 1 } } }], async () => assertEquals((await callTool(tools.manage_depreciations, { action: "update", depreciation_id: 1, depreciation_data: { name: "Updated" } })).success, true));
});
Deno.test("depreciations delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_depreciations, { action: "delete", depreciation_id: 1 })).success, true));
});

// --- model_files ---
Deno.test("model_files list → GET models/1/files", async () => {
  await withStub([{ json: { rows: [] } }], async (cap) => {
    assertEquals((await callTool(tools.model_files, { action: "list", model_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/models/1/files"]);
  });
});
Deno.test("model_files upload missing path", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.model_files, { action: "upload", model_id: 1 })).success, false));
});
Deno.test("model_files download missing file_id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.model_files, { action: "download", model_id: 1 })).success, false));
});
Deno.test("model_files delete → DELETE models/1/files/5/delete", async () => {
  await withStub([{ json: {} }], async (cap) => {
    assertEquals((await callTool(tools.model_files, { action: "delete", model_id: 1, file_id: 5 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["DELETE", "/api/v1/models/1/files/5/delete"]);
  });
});
Deno.test("model_files delete missing file_id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.model_files, { action: "delete", model_id: 1 })).success, false));
});

// --- model_files transfer regressions (bearer token + exact URL) ---
Deno.test("model_files upload → POST models/1/files with bearer token", async () => {
  const tmp = await Deno.makeTempFile({ suffix: ".pdf" });
  await Deno.writeTextFile(tmp, "pdf-bytes");
  try {
    await withStub([{ json: { id: 7 } }], async (cap) => {
      assertEquals((await callTool(tools.model_files, { action: "upload", model_id: 1, file_path: tmp })).success, true);
      assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/models/1/files"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
    });
  } finally {
    await Deno.remove(tmp);
  }
});
Deno.test("model_files download → GET models/1/files/42 with bearer, writes file", async () => {
  const tmp = await Deno.makeTempFile();
  try {
    await withStub([{ bytes: new TextEncoder().encode("file-bytes") }], async (cap) => {
      assertEquals((await callTool(tools.model_files, { action: "download", model_id: 1, file_id: 42, save_path: tmp })).success, true);
      assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/models/1/files/42"]);
      assertEquals(cap[0].headers.get("authorization"), "Bearer test-token");
      assertEquals(new TextDecoder().decode(await Deno.readFile(tmp)), "file-bytes");
    });
  } finally {
    await Deno.remove(tmp);
  }
});
