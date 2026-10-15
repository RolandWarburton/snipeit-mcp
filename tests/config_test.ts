/**
 * Config parsing tests (no Python equivalent file, but covers config.ts -
 * including the SNIPEIT_ALLOWED_TOOLS whitespace handling from test_core.py).
 */

import { assertEquals, assertThrows } from "@std/assert";
import { ConfigError, loadConfig } from "../src/config.ts";

const KEYS = [
  "SNIPEIT_URL",
  "SNIPEIT_TOKEN",
  "MCP_TRANSPORT",
  "MCP_HOST",
  "MCP_PORT",
  "SNIPEIT_ALLOWED_TOOLS",
  "MCP_AUTH",
  "MCP_OIDC_ISSUER",
  "MCP_OIDC_USERINFO_URL",
  "MCP_OIDC_JWKS_URL",
  "MCP_OIDC_JWKS",
  "MCP_OIDC_AUDIENCE",
  "MCP_RESOURCE_URL",
  "MCP_ALLOWED_SUBS",
];

/** Run `fn` with exactly `env` set on the relevant keys, restoring afterward. */
function withEnv(env: Record<string, string>, fn: () => void) {
  const saved = new Map(KEYS.map((k) => [k, Deno.env.get(k)]));
  for (const k of KEYS) Deno.env.delete(k);
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      const v = saved.get(k);
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  }
}

Deno.test("API-key stdio config", () => {
  withEnv({ SNIPEIT_URL: "https://x", SNIPEIT_TOKEN: "t" }, () => {
    const cfg = loadConfig();
    assertEquals(cfg.transport, "stdio");
    assertEquals(cfg.token, "t");
    assertEquals(cfg.allowedTools, undefined);
  });
});

Deno.test("missing token → ConfigError", () => {
  withEnv({ SNIPEIT_URL: "https://x" }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("http transport requires MCP_PORT", () => {
  withEnv({
    SNIPEIT_URL: "https://x",
    SNIPEIT_TOKEN: "t",
    MCP_TRANSPORT: "http",
  }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("invalid transport → ConfigError", () => {
  withEnv({
    SNIPEIT_URL: "https://x",
    SNIPEIT_TOKEN: "t",
    MCP_TRANSPORT: "carrier-pigeon",
  }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("SNIPEIT_ALLOWED_TOOLS trims whitespace", () => {
  withEnv({
    SNIPEIT_URL: "https://x",
    SNIPEIT_TOKEN: "t",
    SNIPEIT_ALLOWED_TOOLS: " manage_assets , system_info ",
  }, () => {
    assertEquals(
      loadConfig().allowedTools,
      new Set(["manage_assets", "system_info"]),
    );
  });
});

// --- OAuth gate config (MCP_AUTH) ---

const HTTP = {
  SNIPEIT_URL: "https://x",
  SNIPEIT_TOKEN: "t",
  MCP_TRANSPORT: "http",
  MCP_PORT: "8080",
};
const ISSUER = "https://dex.example";
const RESOURCE = "https://mcp.example/mcp";

Deno.test("auth disabled by default", () => {
  withEnv({ SNIPEIT_URL: "https://x", SNIPEIT_TOKEN: "t" }, () => {
    assertEquals(loadConfig().auth.enabled, false);
  });
});

Deno.test("auth enabled derives userinfo URL from issuer (trailing slash stripped)", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "true",
    MCP_OIDC_ISSUER: `${ISSUER}/`,
    MCP_RESOURCE_URL: RESOURCE,
  }, () => {
    const { auth } = loadConfig();
    assertEquals(auth.enabled, true);
    assertEquals(auth.issuer, ISSUER);
    assertEquals(auth.userinfoUrl, `${ISSUER}/userinfo`);
  });
});

Deno.test("explicit MCP_OIDC_USERINFO_URL overrides the derived one", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "1",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
    MCP_OIDC_USERINFO_URL: "https://dex.example/custom/userinfo",
  }, () => {
    assertEquals(
      loadConfig().auth.userinfoUrl,
      "https://dex.example/custom/userinfo",
    );
  });
});

Deno.test("jwksUrl is absent by default (userinfo mode)", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "true",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
  }, () => {
    assertEquals(loadConfig().auth.jwksUrl, undefined);
  });
});

Deno.test("MCP_OIDC_JWKS=true derives jwksUrl from issuer", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "true",
    MCP_OIDC_ISSUER: `${ISSUER}/`,
    MCP_RESOURCE_URL: RESOURCE,
    MCP_OIDC_JWKS: "true",
  }, () => {
    assertEquals(loadConfig().auth.jwksUrl, `${ISSUER}/keys`);
  });
});

Deno.test("explicit MCP_OIDC_JWKS_URL overrides the derived one", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "1",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
    MCP_OIDC_JWKS: "true",
    MCP_OIDC_JWKS_URL: "https://dex.example/custom/jwks",
  }, () => {
    assertEquals(loadConfig().auth.jwksUrl, "https://dex.example/custom/jwks");
  });
});

Deno.test("MCP_OIDC_AUDIENCE parses (and is undefined when unset)", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "1",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
    MCP_OIDC_AUDIENCE: "snipeit-mcp",
  }, () => {
    assertEquals(loadConfig().auth.audience, "snipeit-mcp");
  });
  withEnv({
    ...HTTP,
    MCP_AUTH: "1",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
  }, () => {
    assertEquals(loadConfig().auth.audience, undefined);
  });
});

Deno.test("MCP_ALLOWED_SUBS parses into a set", () => {
  withEnv({
    ...HTTP,
    MCP_AUTH: "yes",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
    MCP_ALLOWED_SUBS: " me@x.com , entity-123 ",
  }, () => {
    assertEquals(
      loadConfig().auth.allowedSubjects,
      new Set(["me@x.com", "entity-123"]),
    );
  });
});

Deno.test("auth on stdio → ConfigError", () => {
  withEnv({
    SNIPEIT_URL: "https://x",
    SNIPEIT_TOKEN: "t",
    MCP_AUTH: "true",
    MCP_OIDC_ISSUER: ISSUER,
    MCP_RESOURCE_URL: RESOURCE,
  }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("auth without issuer → ConfigError", () => {
  withEnv({ ...HTTP, MCP_AUTH: "true", MCP_RESOURCE_URL: RESOURCE }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("auth without resource URL → ConfigError", () => {
  withEnv({ ...HTTP, MCP_AUTH: "true", MCP_OIDC_ISSUER: ISSUER }, () => {
    assertThrows(() => loadConfig(), ConfigError);
  });
});

Deno.test("MCP_AUTH unset/false leaves oidc fields absent (no validation)", () => {
  withEnv({ ...HTTP, MCP_AUTH: "false" }, () => {
    const { auth } = loadConfig();
    assertEquals(auth.enabled, false);
    assertEquals(auth.issuer, undefined);
  });
});
