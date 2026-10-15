/**
 * Schema validation tests - port of tests/test_models.py.
 * Verifies the zod schemas parse valid data, leave optionals absent, apply
 * defaults, and reject missing required fields (runtime complement to the
 * pydantic↔zod structural diff).
 */

import { assertEquals, assertThrows } from "@std/assert";
import {
  accessoryCheckoutSchema,
  assetDataSchema,
  checkoutDataSchema,
  componentCheckoutSchema,
  fieldDataSchema,
  groupDataSchema,
  importDataSchema,
  licenseDataSchema,
  userDataSchema,
} from "../src/schemas.ts";

Deno.test("AssetData valid + optionals absent", () => {
  const a = assetDataSchema.parse({ status_id: 1, model_id: 5, name: "Laptop", asset_tag: "LAP-001", serial: "ABC" });
  assertEquals(a.status_id, 1);
  assertEquals(a.name, "Laptop");
  const b = assetDataSchema.parse({ status_id: 1, model_id: 5 });
  assertEquals(b.name, undefined);
  assertEquals(b.serial, undefined);
  assertEquals(b.purchase_cost, undefined);
});

Deno.test("CheckoutData valid + required enforced", () => {
  const c = checkoutDataSchema.parse({ checkout_to_type: "user", assigned_to_id: 10 });
  assertEquals(c.checkout_to_type, "user");
  assertEquals(c.assigned_to_id, 10);
  assertThrows(() => checkoutDataSchema.parse({ checkout_to_type: "user" }));
});

Deno.test("AccessoryCheckout requires checkout_to_type + assigned_to_id", () => {
  const a = accessoryCheckoutSchema.parse({ checkout_to_type: "location", assigned_to_id: 7, checkout_qty: 3 });
  assertEquals(a.checkout_qty, 3);
  assertThrows(() => accessoryCheckoutSchema.parse({}));
});

Deno.test("ComponentCheckout default qty = 1", () => {
  assertEquals(componentCheckoutSchema.parse({ assigned_to: 1 }).assigned_qty, 1);
  assertEquals(componentCheckoutSchema.parse({ assigned_to: 10, assigned_qty: 2 }).assigned_qty, 2);
});

Deno.test("UserData optionals", () => {
  const u = userDataSchema.parse({ first_name: "John", username: "jdoe", password: "s", password_confirmation: "s" });
  assertEquals(u.username, "jdoe");
  assertEquals(userDataSchema.parse({}).groups, undefined);
});

Deno.test("GroupData permissions object", () => {
  assertEquals(groupDataSchema.parse({ name: "Admins", permissions: { admin: "1" } }).permissions, { admin: "1" });
});

Deno.test("FieldData enum fields", () => {
  const f = fieldDataSchema.parse({ name: "MAC Address", element: "text", format: "MAC" });
  assertEquals(f.element, "text");
  assertThrows(() => fieldDataSchema.parse({ element: "bogus" }));
});

Deno.test("LicenseData optionals", () => {
  assertEquals(licenseDataSchema.parse({ name: "Office 365", seats: 50 }).seats, 50);
  assertEquals(licenseDataSchema.parse({}).expiration_date, undefined);
});

Deno.test("ImportData enum + field_map", () => {
  assertEquals(importDataSchema.parse({ import_type: "asset", run_backup: true }).import_type, "asset");
  assertEquals(importDataSchema.parse({ import_type: "asset", field_map: { "Col A": "asset_tag" } }).field_map, { "Col A": "asset_tag" });
  assertThrows(() => importDataSchema.parse({ import_type: "widget" }));
});
