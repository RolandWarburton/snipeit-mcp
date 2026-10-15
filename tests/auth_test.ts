/**
 * Tests for the OAuth gate (src/auth.ts). userinfo calls go through the shared
 * fetch stub, so we assert on the exact introspection request and on caching
 * behaviour without a live issuer.
 */

import { assert, assertEquals } from "@std/assert";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { Authenticator } from "../src/auth.ts";
import type { AuthConfig } from "../src/config.ts";
import { type StubResp, withStub } from "./_harness.ts";

const ISSUER = "https://dex.example";

function cfg(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    enabled: true,
    issuer: ISSUER,
    userinfoUrl: `${ISSUER}/userinfo`,
    resourceUrl: "https://mcp.example/mcp",
    ...overrides,
  };
}

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("https://mcp.example/mcp", { method: "POST", headers });
}

Deno.test("PRM body + challenge header", () => {
  const auth = new Authenticator(cfg());
  assertEquals(auth.protectedResourceMetadata(), {
    resource: "https://mcp.example/mcp",
    authorization_servers: [ISSUER],
  });
  assertEquals(
    auth.challengeHeader(),
    'Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"',
  );
});

Deno.test("missing bearer → 401, no userinfo call", async () => {
  await withStub([], async (captured) => {
    const auth = new Authenticator(cfg());
    assertEquals(await auth.authorize(reqWith()), { ok: false, status: 401 });
    assertEquals(captured.length, 0);
  });
});

Deno.test("non-bearer scheme → 401", async () => {
  await withStub([], async (captured) => {
    const auth = new Authenticator(cfg());
    const res = await auth.authorize(reqWith({ Authorization: "Basic abc" }));
    assertEquals(res, { ok: false, status: 401 });
    assertEquals(captured.length, 0);
  });
});

Deno.test("valid token → 200 userinfo → ok, introspected with the bearer", async () => {
  await withStub(
    [{ json: { sub: "entity-1", email: "me@x.com" } }],
    async (captured) => {
      const auth = new Authenticator(cfg());
      const res = await auth.authorize(
        reqWith({ Authorization: "Bearer opaque-tok" }),
      );
      assert(res.ok);
      assertEquals(res.claims.sub, "entity-1");
      assertEquals(captured.length, 1);
      assertEquals(captured[0].url, `${ISSUER}/userinfo`);
      assertEquals(
        captured[0].headers.get("authorization"),
        "Bearer opaque-tok",
      );
    },
  );
});

Deno.test("userinfo rejects token → 401", async () => {
  await withStub([{ status: 401, json: {} }], async () => {
    const auth = new Authenticator(cfg());
    assertEquals(
      await auth.authorize(reqWith({ Authorization: "Bearer bad" })),
      {
        ok: false,
        status: 401,
      },
    );
  });
});

Deno.test("allowedSubjects: sub in set → ok, absent → 403", async () => {
  await withStub([
    { json: { sub: "entity-1" } },
    { json: { sub: "stranger" } },
  ], async () => {
    const auth = new Authenticator(
      cfg({ allowedSubjects: new Set(["entity-1"]) }),
    );
    assert((await auth.authorize(reqWith({ Authorization: "Bearer a" }))).ok);
    assertEquals(await auth.authorize(reqWith({ Authorization: "Bearer b" })), {
      ok: false,
      status: 403,
    });
  });
});

Deno.test("allowedSubjects matches on email too", async () => {
  await withStub([{ json: { sub: "x", email: "me@x.com" } }], async () => {
    const auth = new Authenticator(
      cfg({ allowedSubjects: new Set(["me@x.com"]) }),
    );
    assert((await auth.authorize(reqWith({ Authorization: "Bearer a" }))).ok);
  });
});

Deno.test("positive result is cached → second call skips userinfo", async () => {
  await withStub([{ json: { sub: "entity-1" } }], async (captured) => {
    const auth = new Authenticator(cfg());
    const first = await auth.authorize(
      reqWith({ Authorization: "Bearer tok" }),
    );
    const second = await auth.authorize(
      reqWith({ Authorization: "Bearer tok" }),
    );
    assert(first.ok && second.ok);
    assertEquals(captured.length, 1); // only one introspection for two requests
  });
});

Deno.test("negatives are never cached → token can succeed on retry", async () => {
  await withStub([
    { status: 401, json: {} },
    { json: { sub: "entity-1" } },
  ], async (captured) => {
    const auth = new Authenticator(cfg());
    assertEquals(
      await auth.authorize(reqWith({ Authorization: "Bearer tok" })),
      {
        ok: false,
        status: 401,
      },
    );
    assert((await auth.authorize(reqWith({ Authorization: "Bearer tok" }))).ok);
    assertEquals(captured.length, 2); // no caching of the failure
  });
});

Deno.test("issuer unreachable → 401 (not a crash)", async () => {
  const original = globalThis.fetch;
  globalThis.fetch =
    (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    const auth = new Authenticator(cfg());
    assertEquals(
      await auth.authorize(reqWith({ Authorization: "Bearer tok" })),
      {
        ok: false,
        status: 401,
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});

// --- Local JWKS validation mode (config.jwksUrl set) --------------------------

const JWKS_URL = `${ISSUER}/keys`;
const KID = "test-key";
// One signing key for the whole suite; its public half is served as the JWKS.
const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const PUBLIC_JWK: JWK = {
  ...(await exportJWK(publicKey)),
  kid: KID,
  alg: "RS256",
  use: "sig",
};
/** The stubbed response jose's remote JWKS resolver fetches. */
const JWKS_RESP: StubResp = { json: { keys: [PUBLIC_JWK] } };

interface MintOpts {
  sub?: string;
  email?: string;
  issuer?: string;
  audience?: string;
  expired?: boolean;
}

/** Sign a JWT with the suite key (defaults: valid, sub=entity-1, 1h expiry). */
async function mint(o: MintOpts = {}): Promise<string> {
  let t = new SignJWT(o.email !== undefined ? { email: o.email } : {})
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(o.issuer ?? ISSUER)
    .setSubject(o.sub ?? "entity-1")
    .setIssuedAt()
    .setExpirationTime(o.expired ? Math.floor(Date.now() / 1000) - 60 : "1h");
  if (o.audience !== undefined) t = t.setAudience(o.audience);
  return await t.sign(privateKey);
}

const jwksCfg = (overrides: Partial<AuthConfig> = {}) =>
  cfg({ jwksUrl: JWKS_URL, ...overrides });

Deno.test("JWKS: valid JWT → ok, verified locally against fetched keys", async () => {
  await withStub([JWKS_RESP], async (captured) => {
    const auth = new Authenticator(jwksCfg());
    const res = await auth.authorize(
      reqWith({ Authorization: `Bearer ${await mint({ email: "me@x.com" })}` }),
    );
    assert(res.ok);
    assertEquals(res.claims.sub, "entity-1");
    assertEquals(res.claims.email, "me@x.com");
    // The only network call is the JWKS fetch - never userinfo.
    assertEquals(captured.length, 1);
    assertEquals(captured[0].url, JWKS_URL);
  });
});

Deno.test("JWKS: expired JWT → 401", async () => {
  await withStub([JWKS_RESP], async () => {
    const auth = new Authenticator(jwksCfg());
    const res = await auth.authorize(
      reqWith({ Authorization: `Bearer ${await mint({ expired: true })}` }),
    );
    assertEquals(res, { ok: false, status: 401 });
  });
});

Deno.test("JWKS: wrong issuer → 401", async () => {
  await withStub([JWKS_RESP], async () => {
    const auth = new Authenticator(jwksCfg());
    const tok = await mint({ issuer: "https://evil.example" });
    assertEquals(
      await auth.authorize(reqWith({ Authorization: `Bearer ${tok}` })),
      {
        ok: false,
        status: 401,
      },
    );
  });
});

Deno.test("JWKS: audience enforced when configured", async () => {
  await withStub([JWKS_RESP], async () => {
    const auth = new Authenticator(jwksCfg({ audience: "snipeit-mcp" }));
    // Correct aud passes; wrong aud is rejected. Same key ⇒ one JWKS fetch.
    assert(
      (await auth.authorize(
        reqWith({
          Authorization: `Bearer ${await mint({ audience: "snipeit-mcp" })}`,
        }),
      )).ok,
    );
    assertEquals(
      await auth.authorize(
        reqWith({
          Authorization: `Bearer ${await mint({ audience: "someone-else" })}`,
        }),
      ),
      { ok: false, status: 401 },
    );
  });
});

Deno.test("JWKS: valid signature but sub not in allowlist → 403", async () => {
  await withStub([JWKS_RESP], async () => {
    const auth = new Authenticator(
      jwksCfg({ allowedSubjects: new Set(["entity-1"]) }),
    );
    const tok = await mint({ sub: "stranger" });
    assertEquals(
      await auth.authorize(reqWith({ Authorization: `Bearer ${tok}` })),
      {
        ok: false,
        status: 403,
      },
    );
  });
});

Deno.test("JWKS: positive result cached → second call re-uses it", async () => {
  await withStub([JWKS_RESP], async (captured) => {
    const auth = new Authenticator(jwksCfg());
    const tok = await mint();
    assert(
      (await auth.authorize(reqWith({ Authorization: `Bearer ${tok}` }))).ok,
    );
    assert(
      (await auth.authorize(reqWith({ Authorization: `Bearer ${tok}` }))).ok,
    );
    assertEquals(captured.length, 1); // one JWKS fetch covers both requests
  });
});

Deno.test("JWKS: garbage bearer → 401 (not a crash)", async () => {
  await withStub([JWKS_RESP], async () => {
    const auth = new Authenticator(jwksCfg());
    assertEquals(
      await auth.authorize(reqWith({ Authorization: "Bearer not.a.jwt" })),
      { ok: false, status: 401 },
    );
  });
});
