import { sha256 } from "./api.js";

// Edit codes are shown to the creator exactly once; only their SHA-256 hash is
// stored. 24 Crockford base32 characters = 120 bits of entropy, so brute force
// is infeasible even without rate limiting. 256 % 32 === 0, so mapping random
// bytes onto the alphabet is unbiased.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 24;

export function generateEditCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  const raw = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
  return raw.match(/.{4}/g).join("-");
}

// Accepts the code however the user pasted it: any case, with or without
// dashes/spaces, and with the look-alike letters Crockford base32 folds away.
export function normalizeEditCode(value = "") {
  return String(value)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

export async function hashEditCode(value) {
  const normalized = normalizeEditCode(value);
  return normalized.length === CODE_LENGTH ? sha256(normalized) : "";
}
