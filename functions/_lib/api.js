export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

export const methodNotAllowed = () => json({ error: "method_not_allowed" }, 405);

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Length-independent, branch-free string comparison for secrets (e.g. password
// hashes). Folds any length mismatch into the accumulator so the result is
// constant-time with respect to the compared values.
export function timingSafeEqual(a = "", b = "") {
  const left = String(a);
  const right = String(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i % right.length || 0);
  }
  return diff === 0;
}
