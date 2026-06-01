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

export function requireAdmin(request, env) {
  const expected = env.ADMIN_TOKEN;
  if (!expected) return { ok: false, response: json({ error: "admin_token_not_configured" }, 500) };
  const auth = request.headers.get("authorization") || "";
  const headerToken = request.headers.get("x-admin-token") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : headerToken.trim();
  if (token && token === expected) return { ok: true };
  return { ok: false, response: json({ error: "unauthorized" }, 401) };
}

export const slugifyInput = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
