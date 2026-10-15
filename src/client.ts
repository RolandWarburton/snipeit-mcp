/**
 * fetch-based Snipe-IT HTTP client - the TypeScript port of the Python
 * `SnipeITDirectAPI`. One instance is built at startup from the static
 * SNIPEIT_URL / SNIPEIT_TOKEN and shared by every tool.
 *
 * Error mapping mirrors the Python client: HTTP status codes are translated
 * into typed errors so tool handlers can branch the same way.
 */

export class SnipeITError extends Error {}
export class SnipeITNotFoundError extends SnipeITError {}
export class SnipeITAuthenticationError extends SnipeITError {}
export class SnipeITValidationError extends SnipeITError {}

export interface ListParams {
  limit?: number;
  offset?: number;
  search?: string;
  sort?: string;
  order?: string;
  /** Extra query params (e.g. status_id, model_id); null/undefined dropped. */
  extra?: Record<string, unknown>;
}

interface RequestOpts {
  params?: Record<string, unknown>;
  json?: unknown;
  headers?: Record<string, string>;
}

export class SnipeITClient {
  readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /** Authorization header, exposed for raw binary requests (downloads/uploads). */
  get authHeader(): string {
    return this.headers.Authorization;
  }

  async request(
    method: string,
    endpoint: string,
    opts: RequestOpts = {},
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}/api/v1/${endpoint}`);
    if (opts.params) {
      for (const [k, v] of Object.entries(opts.params)) {
        if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    const init: RequestInit = {
      method,
      headers: { ...this.headers, ...(opts.headers ?? {}) },
    };
    if (opts.json !== undefined) init.body = JSON.stringify(opts.json);

    const res = await fetch(url, init);

    if (res.status === 404) {
      throw new SnipeITNotFoundError(`Resource not found: ${endpoint}`);
    }
    if (res.status === 401) {
      throw new SnipeITAuthenticationError("Authentication failed");
    }
    if (res.status === 422) {
      const data = await res.json().catch(() => ({})) as Record<string, unknown>;
      throw new SnipeITValidationError(
        String(data.messages ?? JSON.stringify(data)),
      );
    }
    if (!res.ok) {
      throw new SnipeITError(`HTTP ${res.status}: ${await res.text()}`);
    }
    return await res.json() as Record<string, unknown>;
  }

  /** List resources with pagination, returning `[rows, total]`. */
  async listPage(
    endpoint: string,
    p: ListParams = {},
  ): Promise<[Record<string, unknown>[], number]> {
    const params: Record<string, unknown> = {
      limit: p.limit ?? 50,
      offset: p.offset ?? 0,
      sort: p.sort ?? "id",
      order: p.order ?? "asc",
    };
    if (p.search) params.search = p.search;
    if (p.extra) {
      for (const [k, v] of Object.entries(p.extra)) {
        if (v !== null && v !== undefined) params[k] = v;
      }
    }
    const data = await this.request("GET", endpoint, { params });
    const rows = (data.rows as Record<string, unknown>[]) ?? [];
    const total = (data.total as number) ?? rows.length;
    return [rows, total];
  }

  get(endpoint: string, id: number) {
    return this.request("GET", `${endpoint}/${id}`);
  }
  create(endpoint: string, data: unknown) {
    return this.request("POST", endpoint, { json: data });
  }
  update(endpoint: string, id: number, data: unknown) {
    return this.request("PATCH", `${endpoint}/${id}`, { json: data });
  }
  delete(endpoint: string, id: number) {
    return this.request("DELETE", `${endpoint}/${id}`);
  }
}

export interface PaginationMeta {
  count: number;
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export function paginationMeta(
  count: number,
  total: number,
  limit: number,
  offset: number,
): PaginationMeta {
  return { count, total, limit, offset, has_more: offset + count < total };
}

/** Standard fields accepted by Snipe-IT hardware POST/PATCH endpoints. */
export const HARDWARE_STANDARD_FIELDS: ReadonlySet<string> = new Set([
  "name", "asset_tag", "serial", "model_id", "status_id",
  "purchase_date", "purchase_cost", "order_number", "notes",
  "warranty_months", "location_id", "rtd_location_id",
  "supplier_id", "company_id", "requestable", "archived",
  "asset_eol_date", "eol_explicit", "byod",
  "assigned_to", "image", "expected_checkin",
  "next_audit_date", "last_audit_date",
]);
