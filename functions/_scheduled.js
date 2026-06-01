// Scheduled cleanup for expired shares.
//
// Shares are also pruned lazily on first access after expiry, but rows that are
// never visited again would otherwise linger forever. This cron sweep removes
// them so the table reflects only live shares. Wire-up lives in wrangler.toml
// under [triggers].

export async function deleteExpiredShares(db, nowIso) {
  return db
    .prepare("DELETE FROM shares WHERE expires_at IS NOT NULL AND expires_at < ?")
    .bind(nowIso)
    .run();
}

export async function scheduled(event, env, ctx) {
  const now = new Date(event?.scheduledTime ?? Date.now()).toISOString();
  const work = deleteExpiredShares(env.DB, now);
  if (ctx?.waitUntil) ctx.waitUntil(work);
  await work;
}

export default { scheduled };
