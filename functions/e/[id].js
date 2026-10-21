// /e/<id> serves the static edit page; the React editor reads the id from the
// path and the edit code from the URL fragment (which never reaches the server).
export async function onRequestGet({ request, env }) {
  const page = await env.ASSETS.fetch(new URL("/edit/", request.url));
  const response = new Response(page.body, page);
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-robots-tag", "noindex, nofollow");
  response.headers.set("cache-control", "no-store");
  return response;
}
