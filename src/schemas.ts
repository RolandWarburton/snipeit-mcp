/**
 * Reusable zod schemas for tool inputs - TypeScript port of the pydantic
 * models in `schemas.py`. Field descriptions are carried over verbatim so the
 * generated JSON Schema matches the Python server's tool contracts.
 */

import { z } from "zod";

export const assetDataSchema = z.object({
  status_id: z.number().int().optional().describe("ID of the status label"),
  model_id: z.number().int().optional().describe("ID of the asset model"),
  asset_tag: z.string().optional().describe("Asset tag identifier"),
  name: z.string().optional().describe("Asset name"),
  serial: z.string().optional().describe("Serial number"),
  purchase_date: z.string().optional().describe("Purchase date (YYYY-MM-DD)"),
  purchase_cost: z.number().optional().describe("Purchase cost"),
  order_number: z.string().optional().describe("Order number"),
  notes: z.string().optional().describe("Additional notes"),
  warranty_months: z.number().int().optional().describe("Warranty period in months"),
  location_id: z.number().int().optional().describe("Location ID"),
  rtd_location_id: z.number().int().optional().describe("Default location ID"),
  supplier_id: z.number().int().optional().describe("Supplier ID"),
  company_id: z.number().int().optional().describe("Company ID"),
  requestable: z.boolean().optional().describe("Whether asset is requestable"),
});
export type AssetData = z.infer<typeof assetDataSchema>;

export const checkoutDataSchema = z.object({
  checkout_to_type: z.enum(["user", "asset", "location"]).describe(
    "Type of entity to checkout to",
  ),
  assigned_to_id: z.number().int().describe("ID of the user/asset/location"),
  expected_checkin: z.string().optional().describe("Expected checkin date (YYYY-MM-DD)"),
  checkout_at: z.string().optional().describe("Checkout date (YYYY-MM-DD)"),
  note: z.string().optional().describe("Checkout notes"),
  name: z.string().optional().describe("Name for the checkout"),
});
export type CheckoutData = z.infer<typeof checkoutDataSchema>;

export const checkinDataSchema = z.object({
  note: z.string().optional().describe("Checkin notes"),
  location_id: z.number().int().optional().describe("Location ID to checkin to"),
});
export type CheckinData = z.infer<typeof checkinDataSchema>;

export const auditDataSchema = z.object({
  location_id: z.number().int().optional().describe("Location ID"),
  note: z.string().optional().describe("Audit notes"),
  next_audit_date: z.string().optional().describe("Next audit date (YYYY-MM-DD)"),
});
export type AuditData = z.infer<typeof auditDataSchema>;

// Snipe-IT v8.7 renamed the maintenance columns: `title` -> `name`, and the
// free-text `asset_maintenance_type` was replaced by a `maintenance_type_id`
// FK into the new maintenance_types table (validated with `exists:`, so an
// unknown id is a 422). `completion_date` is still accepted as a legacy alias
// for `expected_completion_date` via a model mutator.
export const maintenanceDataSchema = z.object({
  name: z.string().describe("Maintenance title/name (max 100 chars)"),
  maintenance_type_id: z.number().int().describe(
    "Maintenance type ID - use asset_maintenance(action='list_types') to look one up",
  ),
  start_date: z.string().describe("Start date (YYYY-MM-DD)"),
  supplier_id: z.number().int().optional().describe("Supplier ID"),
  is_warranty: z.boolean().optional().describe("Whether the work is covered by warranty"),
  cost: z.number().optional().describe("Maintenance cost"),
  completion_date: z.string().optional().describe(
    "Expected completion date (YYYY-MM-DD), must be >= start_date",
  ),
  url: z.string().optional().describe("Reference URL for the maintenance record"),
  notes: z.string().optional().describe("Maintenance notes"),
});
export type MaintenanceData = z.infer<typeof maintenanceDataSchema>;

export const assetRequestDataSchema = z.object({
  expected_checkout: z.string().optional().describe(
    "Expected checkout date (YYYY-MM-DD)",
  ),
  note: z.string().optional().describe("Note explaining the request"),
});
export type AssetRequestData = z.infer<typeof assetRequestDataSchema>;

// --- Foundational entities ---

export const categoryDataSchema = z.object({
  name: z.string().optional().describe("Category name"),
  category_type: z.enum(["asset", "accessory", "consumable", "component", "license"])
    .optional().describe("Type of category"),
  eula_text: z.string().optional().describe("EULA text for this category"),
  use_default_eula: z.boolean().optional().describe("Use default EULA"),
  require_acceptance: z.boolean().optional().describe("Require users to accept EULA"),
  checkin_email: z.boolean().optional().describe("Send email on checkin"),
  image: z.string().optional().describe("Image filename"),
});
export type CategoryData = z.infer<typeof categoryDataSchema>;

export const manufacturerDataSchema = z.object({
  name: z.string().optional().describe("Manufacturer name"),
  url: z.string().optional().describe("Manufacturer URL"),
  support_url: z.string().optional().describe("Support URL"),
  support_phone: z.string().optional().describe("Support phone number"),
  support_email: z.string().optional().describe("Support email address"),
  image: z.string().optional().describe("Image filename"),
});
export type ManufacturerData = z.infer<typeof manufacturerDataSchema>;

export const assetModelDataSchema = z.object({
  name: z.string().optional().describe("Model name"),
  model_number: z.string().optional().describe("Model number"),
  manufacturer_id: z.number().int().optional().describe("Manufacturer ID"),
  category_id: z.number().int().optional().describe("Category ID"),
  eol: z.number().int().optional().describe("End of life in months"),
  depreciation_id: z.number().int().optional().describe("Depreciation ID"),
  notes: z.string().optional().describe("Additional notes"),
  fieldset_id: z.number().int().optional().describe("Custom fieldset ID"),
  requestable: z.boolean().optional().describe("Whether assets of this model are requestable"),
  image: z.string().optional().describe("Image filename"),
});
export type AssetModelData = z.infer<typeof assetModelDataSchema>;

export const statusLabelDataSchema = z.object({
  name: z.string().optional().describe("Status label name"),
  type: z.enum(["deployable", "pending", "archived", "undeployable"])
    .optional().describe("Status type"),
  color: z.string().optional().describe("Color hex code (e.g., #ff0000)"),
  show_in_nav: z.boolean().optional().describe("Show in navigation"),
  default_label: z.boolean().optional().describe("Use as default status"),
  notes: z.string().optional().describe("Additional notes"),
});
export type StatusLabelData = z.infer<typeof statusLabelDataSchema>;

export const locationDataSchema = z.object({
  name: z.string().optional().describe("Location name"),
  address: z.string().optional().describe("Street address"),
  address2: z.string().optional().describe("Address line 2"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State/Province"),
  country: z.string().optional().describe("Country (2-letter ISO code)"),
  zip: z.string().optional().describe("ZIP/Postal code"),
  ldap_ou: z.string().optional().describe("LDAP OU"),
  manager_id: z.number().int().optional().describe("Manager user ID"),
  parent_id: z.number().int().optional().describe("Parent location ID"),
  currency: z.string().optional().describe("Currency code (e.g., USD)"),
  image: z.string().optional().describe("Image filename"),
});
export type LocationData = z.infer<typeof locationDataSchema>;

export const supplierDataSchema = z.object({
  name: z.string().optional().describe("Supplier name"),
  address: z.string().optional().describe("Street address"),
  address2: z.string().optional().describe("Address line 2"),
  city: z.string().optional().describe("City"),
  state: z.string().optional().describe("State/Province"),
  country: z.string().optional().describe("Country (2-letter ISO code)"),
  zip: z.string().optional().describe("ZIP/Postal code"),
  phone: z.string().optional().describe("Phone number"),
  fax: z.string().optional().describe("Fax number"),
  email: z.string().optional().describe("Email address"),
  contact: z.string().optional().describe("Contact person name"),
  url: z.string().optional().describe("Website URL"),
  notes: z.string().optional().describe("Additional notes"),
  image: z.string().optional().describe("Image filename"),
});
export type SupplierData = z.infer<typeof supplierDataSchema>;

export const depreciationDataSchema = z.object({
  name: z.string().optional().describe(
    "Depreciation name (e.g., 'Computer Equipment (3 Years)')",
  ),
  months: z.number().int().optional().describe("Depreciation period in months"),
});
export type DepreciationData = z.infer<typeof depreciationDataSchema>;

// --- People ---

export const userDataSchema = z.object({
  first_name: z.string().optional().describe("First name"),
  last_name: z.string().optional().describe("Last name"),
  username: z.string().optional().describe("Username for login"),
  password: z.string().optional().describe("Password (required for create)"),
  password_confirmation: z.string().optional().describe("Password confirmation (required for create)"),
  email: z.string().optional().describe("Email address"),
  permissions: z.record(z.string(), z.unknown()).optional().describe("User permissions object"),
  activated: z.boolean().optional().describe("Whether user account is activated"),
  phone: z.string().optional().describe("Phone number"),
  jobtitle: z.string().optional().describe("Job title"),
  manager_id: z.number().int().optional().describe("Manager user ID"),
  employee_num: z.string().optional().describe("Employee number"),
  department_id: z.number().int().optional().describe("Department ID"),
  company_id: z.number().int().optional().describe(
    "Company ID - legacy single-company field. On v8.6+ this ADDS the company " +
      "without detaching existing ones; use company_ids to replace the full set.",
  ),
  company_ids: z.array(z.number().int()).optional().describe(
    "List of company IDs (v8.6+ multi-company). Replaces the user's companies entirely.",
  ),
  location_id: z.number().int().optional().describe("Location ID"),
  notes: z.string().optional().describe("Additional notes"),
  groups: z.array(z.number().int()).optional().describe("List of group IDs"),
  ldap_import: z.boolean().optional().describe("Whether user was imported from LDAP"),
});
export type UserData = z.infer<typeof userDataSchema>;

export const companyDataSchema = z.object({
  name: z.string().optional().describe("Company name"),
  image: z.string().optional().describe("Image filename"),
});
export type CompanyData = z.infer<typeof companyDataSchema>;

export const departmentDataSchema = z.object({
  name: z.string().optional().describe("Department name"),
  company_id: z.number().int().optional().describe("Company ID"),
  location_id: z.number().int().optional().describe("Location ID"),
  manager_id: z.number().int().optional().describe("Manager user ID"),
  notes: z.string().optional().describe("Additional notes"),
  image: z.string().optional().describe("Image filename"),
});
export type DepartmentData = z.infer<typeof departmentDataSchema>;

export const groupDataSchema = z.object({
  name: z.string().optional().describe("Group name"),
  permissions: z.record(z.string(), z.unknown()).optional().describe(
    "Permissions object defining group access rights",
  ),
});
export type GroupData = z.infer<typeof groupDataSchema>;

// --- Inventory ---

export const consumableDataSchema = z.object({
  name: z.string().optional().describe("Consumable name"),
  qty: z.number().int().optional().describe("Quantity"),
  category_id: z.number().int().optional().describe("Category ID"),
  company_id: z.number().int().optional().describe("Company ID"),
  location_id: z.number().int().optional().describe("Location ID"),
  manufacturer_id: z.number().int().optional().describe("Manufacturer ID"),
  model_number: z.string().optional().describe("Model number"),
  item_no: z.string().optional().describe("Item number"),
  order_number: z.string().optional().describe("Order number"),
  purchase_date: z.string().optional().describe("Purchase date (YYYY-MM-DD)"),
  purchase_cost: z.number().optional().describe("Purchase cost"),
  min_amt: z.number().int().optional().describe("Minimum quantity threshold"),
  notes: z.string().optional().describe("Additional notes"),
});
export type ConsumableData = z.infer<typeof consumableDataSchema>;

export const componentDataSchema = z.object({
  name: z.string().optional().describe("Component name"),
  qty: z.number().int().optional().describe("Total quantity"),
  category_id: z.number().int().optional().describe("Category ID (must be component-type)"),
  company_id: z.number().int().optional().describe("Company ID"),
  location_id: z.number().int().optional().describe("Location ID"),
  manufacturer_id: z.number().int().optional().describe("Manufacturer ID"),
  supplier_id: z.number().int().optional().describe("Supplier ID"),
  model_number: z.string().optional().describe("Model number"),
  serial: z.string().optional().describe("Serial number"),
  order_number: z.string().optional().describe("Order number"),
  purchase_date: z.string().optional().describe("Purchase date (YYYY-MM-DD)"),
  purchase_cost: z.number().optional().describe("Purchase cost per unit"),
  min_amt: z.number().int().optional().describe("Minimum quantity threshold for alerts"),
  notes: z.string().optional().describe("Additional notes"),
});
export type ComponentData = z.infer<typeof componentDataSchema>;

export const componentCheckoutSchema = z.object({
  assigned_to: z.number().int().describe("Asset ID to checkout component to"),
  assigned_qty: z.number().int().default(1).describe("Quantity to checkout"),
  note: z.string().optional().describe("Checkout notes"),
});
export type ComponentCheckout = z.infer<typeof componentCheckoutSchema>;

export const accessoryDataSchema = z.object({
  name: z.string().optional().describe("Accessory name"),
  qty: z.number().int().optional().describe("Total quantity available"),
  category_id: z.number().int().optional().describe("Category ID (must be accessory-type)"),
  manufacturer_id: z.number().int().optional().describe("Manufacturer ID"),
  supplier_id: z.number().int().optional().describe("Supplier ID"),
  location_id: z.number().int().optional().describe("Location ID"),
  company_id: z.number().int().optional().describe("Company ID"),
  model_number: z.string().optional().describe("Model number"),
  order_number: z.string().optional().describe("Order number"),
  purchase_cost: z.number().optional().describe("Purchase cost"),
  purchase_date: z.string().optional().describe("Purchase date (YYYY-MM-DD)"),
  min_amt: z.number().int().optional().describe("Minimum quantity threshold for reorder alerts"),
  notes: z.string().optional().describe("Additional notes"),
});
export type AccessoryData = z.infer<typeof accessoryDataSchema>;

export const accessoryCheckoutSchema = z.object({
  checkout_to_type: z.enum(["user", "asset", "location"]).describe(
    "Type of entity to checkout the accessory to",
  ),
  assigned_to_id: z.number().int().describe("ID of the user/asset/location to checkout to"),
  checkout_qty: z.number().int().optional().describe("Quantity to checkout (server defaults to 1)"),
  note: z.string().optional().describe("Checkout notes"),
});
export type AccessoryCheckout = z.infer<typeof accessoryCheckoutSchema>;

// --- Licenses ---

export const licenseDataSchema = z.object({
  name: z.string().optional().describe("License name"),
  seats: z.number().int().optional().describe("Number of seats/installations allowed"),
  category_id: z.number().int().optional().describe("Category ID"),
  company_id: z.number().int().optional().describe("Company ID"),
  manufacturer_id: z.number().int().optional().describe("Manufacturer ID"),
  serial: z.string().optional().describe("License key/serial number"),
  purchase_date: z.string().optional().describe("Purchase date (YYYY-MM-DD)"),
  purchase_cost: z.number().optional().describe("Purchase cost"),
  expiration_date: z.string().optional().describe("Expiration date (YYYY-MM-DD)"),
  license_name: z.string().optional().describe("Licensed to name"),
  license_email: z.string().optional().describe("Licensed to email"),
  maintained: z.boolean().optional().describe("Whether license has maintenance/support"),
  reassignable: z.boolean().optional().describe("Whether license can be reassigned"),
  notes: z.string().optional().describe("Additional notes"),
  order_number: z.string().optional().describe("Order number"),
  supplier_id: z.number().int().optional().describe("Supplier ID"),
  termination_date: z.string().optional().describe("Termination date (YYYY-MM-DD)"),
});
export type LicenseData = z.infer<typeof licenseDataSchema>;

export const licenseSeatCheckoutSchema = z.object({
  assigned_to: z.number().int().optional().describe("User ID to assign the seat to"),
  asset_id: z.number().int().optional().describe("Asset ID to assign the seat to"),
  note: z.string().optional().describe("Checkout notes"),
});
export type LicenseSeatCheckout = z.infer<typeof licenseSeatCheckoutSchema>;

// --- Custom fields ---

export const fieldDataSchema = z.object({
  name: z.string().optional().describe("Field name"),
  element: z.enum(["text", "textarea", "listbox", "checkbox", "radio"]).optional()
    .describe("Field element type"),
  field_values: z.string().optional().describe(
    "Possible values for listbox/radio (newline separated)",
  ),
  field_encrypted: z.boolean().optional().describe("Whether field value is encrypted"),
  show_in_email: z.boolean().optional().describe("Show field in emails"),
  help_text: z.string().optional().describe("Help text displayed with field"),
  format: z.enum([
    "ANY", "ALPHA", "ALPHA-DASH", "NUMERIC", "ALPHA-NUMERIC", "EMAIL", "DATE",
    "URL", "IP", "IPV4", "IPV6", "MAC", "BOOLEAN", "REGEX",
  ]).optional().describe("Validation format for the field"),
  custom_format: z.string().optional().describe("Custom regex pattern when format is REGEX"),
});
export type FieldData = z.infer<typeof fieldDataSchema>;

export const fieldsetDataSchema = z.object({
  name: z.string().optional().describe("Fieldset name"),
});
export type FieldsetData = z.infer<typeof fieldsetDataSchema>;

// --- Imports ---

export const importDataSchema = z.object({
  import_type: z.enum([
    "asset", "accessory", "consumable", "component", "license", "user", "location",
  ]).optional().describe("Type of data being imported"),
  field_map: z.record(z.string(), z.unknown()).optional().describe(
    "Maps CSV column names to Snipe-IT field names",
  ),
  run_backup: z.boolean().optional().describe("Whether to backup database before import"),
});
export type ImportData = z.infer<typeof importDataSchema>;
