import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedOrigin,
  isLocalRequest,
  isLoopbackHost,
} from "../server/core/local-access.js";

describe("isLoopbackHost", () => {
  it("accepts loopback hosts with and without a port", () => {
    for (const host of ["localhost", "localhost:3002", "127.0.0.1:3002", "[::1]:3002", "LOCALHOST:3002"]) {
      assert.equal(isLoopbackHost(host), true, host);
    }
  });

  it("rejects other hosts, including DNS-rebinding names", () => {
    for (const host of [undefined, "", "evil.example", "evil.example:3002", "192.168.1.5:3002", "localhost.evil.example", "127.0.0.1.nip.io"]) {
      assert.equal(isLoopbackHost(host), false, String(host));
    }
  });
});

describe("isAllowedOrigin", () => {
  it("allows requests without an Origin header (CLI, curl)", () => {
    assert.equal(isAllowedOrigin(undefined), true);
  });

  it("allows local pages on any port", () => {
    for (const origin of ["http://localhost:5200", "http://127.0.0.1:3002", "http://[::1]:3002", "https://localhost"]) {
      assert.equal(isAllowedOrigin(origin), true, origin);
    }
  });

  it("rejects other websites and opaque origins", () => {
    for (const origin of ["https://evil.example", "http://localhost.evil.example", "null", "file://", "chrome-extension://abc"]) {
      assert.equal(isAllowedOrigin(origin), false, origin);
    }
  });
});

describe("isLocalRequest", () => {
  it("requires both a loopback Host and an allowed Origin", () => {
    assert.equal(isLocalRequest({ host: "127.0.0.1:3002" }), true);
    assert.equal(isLocalRequest({ host: "localhost:3002", origin: "http://localhost:5200" }), true);
    assert.equal(isLocalRequest({ host: "localhost:3002", origin: "https://evil.example" }), false);
    assert.equal(isLocalRequest({ host: "evil.example:3002", origin: "http://evil.example:3002" }), false);
    assert.equal(isLocalRequest({}), false);
  });
});
