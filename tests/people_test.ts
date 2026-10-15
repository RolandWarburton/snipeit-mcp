/** Tests for the people module - port of tests/test_users_org.py. */

import { assertEquals } from "@std/assert";
import { peopleTools } from "../src/tools/people.ts";
import { callTool, makeClient, toolMap, withStub } from "./_harness.ts";

const tools = toolMap(peopleTools(makeClient()));
const OK = { json: { status: "success" } };
const EMPTY_LIST = { json: { rows: [], total: 0 } };

// --- manage_users ---
Deno.test("users create → POST users", async () => {
  await withStub([{ json: { payload: { id: 1 } } }], async (cap) => {
    const r = await callTool(tools.manage_users, { action: "create", user_data: { first_name: "John", username: "jdoe", password: "pass123" } });
    assertEquals(r.success, true);
    assertEquals(r.action, "create");
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/users"]);
  });
});
Deno.test("users create missing data", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "create" })).success, false));
});
Deno.test("users create missing required", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "create", user_data: {} })).success, false));
});
Deno.test("users get", async () => {
  await withStub([{ json: { id: 1, username: "jdoe" } }], async () => assertEquals((await callTool(tools.manage_users, { action: "get", user_id: 1 })).success, true));
});
Deno.test("users get missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "get" })).success, false));
});
Deno.test("users list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_users, { action: "list" })).success, true));
});
Deno.test("users update", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_users, { action: "update", user_id: 1, user_data: { first_name: "Jane" } })).success, true));
});
Deno.test("users update missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "update", user_data: { first_name: "X" } })).success, false));
});
Deno.test("users delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_users, { action: "delete", user_id: 1 })).success, true));
});
Deno.test("users delete missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "delete" })).success, false));
});
Deno.test("users restore → POST users/1/restore", async () => {
  await withStub([OK], async (cap) => {
    assertEquals((await callTool(tools.manage_users, { action: "restore", user_id: 1 })).success, true);
    assertEquals([cap[0].method, cap[0].path], ["POST", "/api/v1/users/1/restore"]);
  });
});
Deno.test("users restore missing id", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_users, { action: "restore" })).success, false));
});
Deno.test("users me → GET users/me", async () => {
  await withStub([{ json: { id: 1, username: "admin" } }], async (cap) => {
    const r = await callTool(tools.manage_users, { action: "me" });
    assertEquals(r.success, true);
    assertEquals(r.action, "me");
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/users/me"]);
  });
});

// --- user_assets ---
Deno.test("user_assets all → includes assets key", async () => {
  await withStub([EMPTY_LIST, EMPTY_LIST, EMPTY_LIST, EMPTY_LIST], async () => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "all" });
    assertEquals(r.success, true);
    assertEquals("assets" in r, true);
  });
});
Deno.test("user_assets assets", async () => {
  await withStub([{ json: { rows: [{ id: 1 }] } }], async () => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "assets" });
    assertEquals("assets" in r, true);
  });
});
Deno.test("user_assets accessories", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "accessories" });
    assertEquals("accessories" in r, true);
  });
});
Deno.test("user_assets licenses", async () => {
  await withStub([EMPTY_LIST], async () => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "licenses" });
    assertEquals("licenses" in r, true);
  });
});
Deno.test("user_assets all → assets/accessories/licenses only (no consumables route)", async () => {
  await withStub([EMPTY_LIST, EMPTY_LIST, EMPTY_LIST], async (cap) => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "all" });
    assertEquals("consumables" in r, false);
    assertEquals(cap.map((c) => c.path), [
      "/api/v1/users/1/assets",
      "/api/v1/users/1/accessories",
      "/api/v1/users/1/licenses",
    ]);
  });
});
Deno.test("user_assets eulas → GET users/1/eulas", async () => {
  await withStub([EMPTY_LIST], async (cap) => {
    const r = await callTool(tools.user_assets, { user_id: 1, asset_type: "eulas" });
    assertEquals("eulas" in r, true);
    assertEquals([cap[0].method, cap[0].path], ["GET", "/api/v1/users/1/eulas"]);
  });
});

// user_two_factor was removed: Snipe-IT v8.7 dropped users/two_factor_reset
// from the v1 API and exposes 2FA state read-only.
Deno.test("user_two_factor tool is no longer registered", () => {
  assertEquals("user_two_factor" in tools, false);
});

// --- manage_companies ---
Deno.test("companies create", async () => {
  await withStub([{ json: { id: 1, name: "Acme" } }], async () => assertEquals((await callTool(tools.manage_companies, { action: "create", company_data: { name: "Acme" } })).success, true));
});
Deno.test("companies create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_companies, { action: "create", company_data: {} })).success, false));
});
Deno.test("companies get", async () => {
  await withStub([{ json: { id: 1, name: "Acme" } }], async () => assertEquals((await callTool(tools.manage_companies, { action: "get", company_id: 1 })).success, true));
});
Deno.test("companies list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_companies, { action: "list" })).success, true));
});
Deno.test("companies delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_companies, { action: "delete", company_id: 1 })).success, true));
});

// --- manage_departments ---
Deno.test("departments create", async () => {
  await withStub([{ json: { id: 1, name: "Engineering" } }], async () => assertEquals((await callTool(tools.manage_departments, { action: "create", department_data: { name: "Engineering" } })).success, true));
});
Deno.test("departments create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_departments, { action: "create", department_data: {} })).success, false));
});
Deno.test("departments get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_departments, { action: "get", department_id: 1 })).success, true));
});
Deno.test("departments list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_departments, { action: "list" })).success, true));
});
Deno.test("departments delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_departments, { action: "delete", department_id: 1 })).success, true));
});

// --- manage_groups ---
Deno.test("groups create", async () => {
  await withStub([{ json: { id: 1, name: "Admins" } }], async () => assertEquals((await callTool(tools.manage_groups, { action: "create", group_data: { name: "Admins" } })).success, true));
});
Deno.test("groups create missing name", async () => {
  await withStub([], async () => assertEquals((await callTool(tools.manage_groups, { action: "create", group_data: {} })).success, false));
});
Deno.test("groups get", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_groups, { action: "get", group_id: 1 })).success, true));
});
Deno.test("groups list", async () => {
  await withStub([EMPTY_LIST], async () => assertEquals((await callTool(tools.manage_groups, { action: "list" })).success, true));
});
Deno.test("groups update with permissions", async () => {
  await withStub([{ json: { id: 1 } }], async () => assertEquals((await callTool(tools.manage_groups, { action: "update", group_id: 1, group_data: { name: "Admins", permissions: { admin: "1" } } })).success, true));
});
Deno.test("groups delete", async () => {
  await withStub([{ json: {} }], async () => assertEquals((await callTool(tools.manage_groups, { action: "delete", group_id: 1 })).success, true));
});
