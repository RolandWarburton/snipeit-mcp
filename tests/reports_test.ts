/** Tests for the reports module - port of the reporting tests in test_admin.py. */

import { assertEquals } from "@std/assert";
import { reportsTools } from "../src/tools/reports.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(reportsTools(makeClient()));

// --- activity_reports ---
Deno.test("activity_reports list → count 1", async () => {
  await withStub([{ json: { rows: [{ id: 1, action_type: "checkout" }] } }], async (cap) => {
    const r = await callTool(tools.activity_reports, { action: "list" });
    assertEquals(r.success, true);
    assertEquals(r.count, 1);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/reports/activity"]);
  });
});
Deno.test("activity_reports list with filters → query params", async () => {
  await withStub([{ json: { rows: [] } }], async (cap) => {
    const r = await callTool(tools.activity_reports, { action: "list", target_type: "asset", action_type: "checkout" });
    assertEquals(r.success, true);
    assertEquals(cap[0].query.get("target_type"), "asset");
    assertEquals(cap[0].query.get("action_type"), "checkout");
  });
});
Deno.test("activity_reports item_activity → maps asset→hardware", async () => {
  await withStub([{ json: { rows: [{ id: 1 }] } }], async (cap) => {
    const r = await callTool(tools.activity_reports, { action: "item_activity", item_type: "asset", item_id: 1 });
    assertEquals(r.success, true);
    assertEquals(r.action, "item_activity");
    assertEquals(cap[0].query.get("item_type"), "hardware");
  });
});
Deno.test("activity_reports item_activity missing params", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.activity_reports, { action: "item_activity" })).success, false));
});
Deno.test("activity_reports item_activity invalid type", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.activity_reports, { action: "item_activity", item_type: "invalid", item_id: 1 })).success, false));
});

// --- status_summary ---
Deno.test("status_summary → GET statuslabels, projects assets_count", async () => {
  const rows = [
    { id: 1, name: "Ready to Deploy", type: "deployable", assets_count: 50 },
    { id: 2, name: "Pending", type: "pending", assets_count: 10 },
  ];
  await withStub([{ json: { total: 2, rows } }], async (cap) => {
    const res = await callTool(tools.status_summary, {});
    assertEquals(res.success, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/statuslabels"]);
    assertEquals(res.total_assets, 60);
    assertEquals(res.summary, [
      { id: 1, name: "Ready to Deploy", type: "deployable", assets_count: 50 },
      { id: 2, name: "Pending", type: "pending", assets_count: 10 },
    ]);
  });
});

// --- audit_tracking ---
Deno.test("audit_tracking due → count 1", async () => {
  await withStub([{ json: { rows: [{ id: 1 }], total: 1 } }], async (cap) => {
    const r = await callTool(tools.audit_tracking, { action: "due" });
    assertEquals(r.success, true);
    assertEquals(r.action, "due");
    assertEquals(r.count, 1);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/audit/due"]);
  });
});
Deno.test("audit_tracking overdue", async () => {
  await withStub([{ json: { rows: [{ id: 2 }], total: 1 } }], async (cap) => {
    const r = await callTool(tools.audit_tracking, { action: "overdue" });
    assertEquals(r.action, "overdue");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/hardware/audit/overdue"]);
  });
});
Deno.test("audit_tracking summary → combines due/overdue counts", async () => {
  await withStub([
    { json: { rows: [{ id: 1 }], total: 5 } },
    { json: { rows: [{ id: 2 }], total: 3 } },
  ], async () => {
    const r = await callTool(tools.audit_tracking, { action: "summary" });
    assertEquals(r.success, true);
    assertEquals(r.due_count, 5);
    assertEquals(r.overdue_count, 3);
  });
});

// Error mapping (from test_error_handling.py)
Deno.test("audit_tracking 404 → not found", async () => {
  await withStub([{ status: 404, json: {} }], async () => {
    const r = await callTool(tools.audit_tracking, { action: "due" });
    assertEquals(r.success, false);
    assertEquals(String(r.error).toLowerCase().includes("not found"), true);
  });
});
Deno.test("status_summary 500 → snipe-it error", async () => {
  await withStub([{ status: 500, json: {} }], async () => {
    assertEquals((await callTool(tools.status_summary, {})).success, false);
  });
});
Deno.test("status_summary non-JSON 200 → unexpected error", async () => {
  await withStub([{ bytes: new TextEncoder().encode("boom") }], async () => {
    const r = await callTool(tools.status_summary, {});
    assertEquals(r.success, false);
    assertEquals(String(r.error).toLowerCase().includes("unexpected"), true);
  });
});
