import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, encodedHash, extra] = storedHash.split(":");
  if (
    !salt ||
    !encodedHash ||
    extra !== undefined ||
    !/^[0-9a-f]{32}$/i.test(salt) ||
    !/^[0-9a-f]{128}$/i.test(encodedHash)
  )
    return false;
  const hash = await deriveKey(password, salt);
  const expected = Buffer.from(encodedHash, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
