import assert from "node:assert/strict";
import { test } from "node:test";
import { readEnvironment } from "../../src/config/env.js";
import { hashPassword, verifyPassword } from "../../src/modules/auth/password.js";

test("password hashing uses unique salts and safely rejects malformed hashes", async () => {
  const first = await hashPassword("password123");
  const second = await hashPassword("password123");
  assert.notEqual(first, second);
  assert.equal(await verifyPassword("password123", first), true);
  assert.equal(await verifyPassword("wrongpassword", first), false);
  for (const malformed of ["", "bad", "salt:hash", first + ":extra"]) {
    assert.equal(await verifyPassword("password123", malformed), false);
  }
});

test("configuration requires credentials and a valid TCP port", () => {
  const valid = {
    DATABASE_URL: "postgresql://localhost/test",
    JWT_SECRET: "a".repeat(32),
  };
  assert.equal(readEnvironment(valid).port, 3001);
  assert.equal(readEnvironment({ ...valid, PORT: "4000" }).port, 4000);
  assert.throws(
    () => readEnvironment({ JWT_SECRET: valid.JWT_SECRET }),
    /DATABASE_URL/,
  );
  assert.throws(
    () =>
      readEnvironment({
        DATABASE_URL: valid.DATABASE_URL,
        JWT_SECRET: "short",
      }),
    /JWT_SECRET/,
  );
  for (const port of ["", "0", "-1", "65536", "3.5", "invalid"]) {
    assert.throws(() => readEnvironment({ ...valid, PORT: port }), /PORT/);
  }
});
