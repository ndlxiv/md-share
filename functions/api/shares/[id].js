// POST /api/shares/:id — read a share. Handles expiration, burn-after-reading
// and password protection. Body may include { password } when required.
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function sha256(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env, params }) {
  if (!env.DB) return json({ error: "database_unavailable" }, 500);

  const id = params.id;
  if (!id) return json({ error: "not_found" }, 404);

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const row = await env.DB.prepare("SELECT * FROM shares WHERE id = ?").bind(id).first();
  if (!row) return json({ error: "not_found" }, 404);

  if (row.expires_at && Date.now() > row.expires_at) {
    await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
    return json({ error: "expired" }, 410);
  }

  if (row.password_hash) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) return json({ error: "password_required", passwordRequired: true }, 401);
    if ((await sha256(password)) !== row.password_hash) {
      return json({ error: "wrong_password", passwordRequired: true }, 401);
    }
  }

  // Only burn once the share has been successfully (and authorizedly) read.
  if (row.burn_after_reading) {
    await env.DB.prepare("DELETE FROM shares WHERE id = ?").bind(id).run();
  }

  return json({ content: row.content, filename: row.filename });
}
