import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts stored secrets such as CI access tokens with AES-256-GCM.
 * The key comes from CONFIG_ENCRYPTION_KEY, or SESSION_SECRET when that is not set.
 * Changing the key makes saved tokens unreadable; people then enter them again.
 */
function key() {
  const secret = process.env.CONFIG_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Set CONFIG_ENCRYPTION_KEY or SESSION_SECRET (at least 32 characters) to store secrets.");
  return createHash("sha256").update(`codeless-config:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null when the value cannot be decrypted, for example after the key changed. */
export function decryptSecret(sealed: string): string | null {
  try {
    const [version, iv, tag, data] = sealed.split(".");
    if (version !== "v1") return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
