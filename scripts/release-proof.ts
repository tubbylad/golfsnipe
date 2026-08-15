/**
 * Release proof — end-to-end verification that the sniper catches a tee-sheet
 * release and books a just-opened slot, using the SAME production code path the
 * worker uses (BrsSession.bookSlot → parseBookingForm → buildBookingBody).
 *
 * This exists because the throwaway standalone proof (proof.mjs) used a brittle
 * regex to read the booker and returned undefined at release. The real parser
 * (parse.ts parseBookingForm) is order-independent with a first-option fallback,
 * so it must be exercised directly.
 *
 *   DRY (no booking; assembles + reports the payload, verifies the parser reads the booker):
 *     PDATE=2026/08/22 MIN_HOUR=15 npx tsx scripts/release-proof.ts
 *
 *   LIVE (real book at release, then immediate cancel + verify):
 *     PROOF_LIVE=1 PDATE=2026/08/23 MIN_HOUR=13 npx tsx scripts/release-proof.ts
 *
 * Reads the BRS account (+ encrypted password) straight from the DB, exactly like
 * the worker. Waits for the date's release instant internally, then burst-polls.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/vault';
import { BrsSession } from '@/brs/session';
import { findSlot, type Slot } from '@/brs/parse';

const LIVE = process.env.PROOF_LIVE === '1'; // real book+cancel; else dry-run (no booking)
const DATE = process.env.PDATE || '2026/08/23'; // target date, YYYY/MM/DD
const MIN_HOUR = Number(process.env.MIN_HOUR || '13'); // first bookable slot at/after this hour
const BURST_MS = Number(process.env.BURST_MS || '250');
const MAX_POLL_MS = Number(process.env.MAX_POLL_MS || String(6 * 60_000));
const WAIT_TICK_MS = Number(process.env.WAIT_TICK_MS || '30000'); // keep-alive cadence pre-release
const ARM_LEAD_MS = 10_000; // stop keep-alive and start burst-polling this long before release

const stamp = () => new Date().toISOString();
const log = (m: string) => console.log(`${stamp()} ${m}`);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** First bookable slot at/after MIN_HOUR, scanning times chronologically. */
function firstBookable(avail: unknown, minHour: number): { time: string; slot: Slot } | null {
  const times = (avail as { times?: Record<string, unknown> }).times ?? {};
  for (const time of Object.keys(times).sort()) {
    // "HH:mm" sorts chronologically
    if (Number(time.split(':')[0]) < minHour) continue;
    const slot = findSlot(avail as Parameters<typeof findSlot>[0], time);
    if (slot?.bookable && slot.url) return { time, slot };
  }
  return null;
}

(async () => {
  log(`=== release-proof (${LIVE ? 'LIVE book+cancel' : 'DRY — no booking'}) date=${DATE} minHour=${MIN_HOUR} ===`);

  const account = await prisma.brsAccount.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!account) {
    log('ERROR: no BRS account in DB');
    process.exit(1);
  }
  log(`account: ${account.clubSlug} course ${account.courseId} (user ${account.username})`);

  const password = await decryptSecret(account.passwordCipher, account.passwordNonce);
  const s = new BrsSession({ clubSlug: account.clubSlug });
  await s.login(account.username, password);
  log('logged in ✓');

  // CLEANUP mode (safety net): just cancel a named slot on PDATE and verify it's
  // freed. Used by the post-release safety timer to guarantee no booking lingers.
  const cleanupTime = process.env.CLEANUP_TIME;
  if (cleanupTime) {
    log(`CLEANUP mode: ensuring ${DATE} ${cleanupTime} is not held`);
    const before = await s.getSlot(account.courseId, DATE, cleanupTime);
    if (before?.booked !== true) {
      log(`nothing to clean — ${cleanupTime} booked=${before?.booked}`);
    } else {
      for (let i = 1; i <= 5; i++) {
        const cancelled = await s.cancelBooking(account.courseId, DATE, cleanupTime);
        const check = await s.getSlot(account.courseId, DATE, cleanupTime);
        log(`cleanup attempt ${i}: cancelBooking->${cancelled}, booked=${check?.booked}`);
        if (check?.booked === false) break;
        await sleep(1000);
      }
    }
    await s.logout();
    await prisma.$disconnect();
    return;
  }

  // Wait for the release instant if the date isn't live yet. Keep the session warm
  // with a light poll every WAIT_TICK_MS (never one long sleep — a stale session at
  // release would blow the single shot), then arm the burst ARM_LEAD_MS before release.
  const release = await s.getReleaseInfo(account.courseId, DATE);
  if (release) {
    const releaseAt = Date.parse(release.time);
    log(`release at ${release.time} (${Math.round((releaseAt - Date.now()) / 1000)}s away) — "${release.title}"`);
    while (releaseAt - Date.now() > ARM_LEAD_MS) {
      await sleep(Math.min(WAIT_TICK_MS, releaseAt - Date.now() - ARM_LEAD_MS));
      try {
        await s.getAvailability(account.courseId, DATE); // keep-alive
      } catch (e) {
        log(`keep-alive error: ${(e as Error).message} — re-logging in`);
        try {
          await s.login(account.username, password);
        } catch (e2) {
          log(`re-login failed: ${(e2 as Error).message}`);
        }
      }
      log(`waiting… ${Math.round((releaseAt - Date.now()) / 1000)}s to release`);
    }
    log(`≤${ARM_LEAD_MS / 1000}s to release — arming burst poll`);
  } else {
    log('date is already live (no release rule) — polling immediately');
  }

  // Burst-poll until a bookable slot appears.
  let hit: { time: string; slot: Slot } | null = null;
  const deadline = Date.now() + MAX_POLL_MS;
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    try {
      const avail = await s.getAvailability(account.courseId, DATE);
      hit = firstBookable(avail, MIN_HOUR);
    } catch (e) {
      log(`poll ${polls} error: ${(e as Error).message}`);
      try {
        await s.login(account.username, password); // self-heal a dropped session
      } catch {
        /* keep polling; next attempt retries */
      }
    }
    if (hit) {
      log(`slot ${hit.time} bookable after ${polls} polls ✓`);
      break;
    }
    await sleep(BURST_MS);
  }
  if (!hit) {
    log(`no bookable slot ≥${MIN_HOUR}:00 within ${MAX_POLL_MS / 1000}s (${polls} polls)`);
    await s.logout();
    process.exit(1);
  }

  // Book (or dry-assemble) via the REAL production bookSlot.
  const result = await s.bookSlot(hit.slot.url as string, { holes: 18, partners: [], dryRun: !LIVE });
  log(`bookSlot(${hit.time}) -> ${JSON.stringify(result).slice(0, 300)}`);

  if (result.status === 'would-book') {
    log(`DRY OK ✓ — parser read booker + built a ${result.body.length}-byte body. No booking placed.`);
    log(`  players=${JSON.stringify(result.players)}  action=${result.action}`);
  } else if (result.status === 'booked') {
    const seated = await s.getSlot(account.courseId, DATE, hit.time);
    log(`BOOKED ✓ seat holders: ${JSON.stringify(seated?.participants.map((p) => p.name))}`);
    // Cancel with retries — a real booking must never be left on the account.
    let freed = false;
    for (let i = 1; i <= 5 && !freed; i++) {
      const cancelled = await s.cancelBooking(account.courseId, DATE, hit.time);
      const check = await s.getSlot(account.courseId, DATE, hit.time);
      freed = check?.booked === false;
      log(`cancel attempt ${i}: cancelBooking->${cancelled}, slot booked=${check?.booked}`);
      if (!freed) await sleep(1000);
    }
    log(
      freed
        ? 'PROOF COMPLETE ✅ — caught the release, booked, then cancelled clean'
        : `⚠⚠ COULD NOT CANCEL — MANUAL CLEANUP NEEDED for ${DATE} ${hit.time}`,
    );
  } else {
    log(`FAILED: ${result.status} — ${(result as { reason?: string }).reason}`);
    // Diagnostic: dump the raw form so a parse failure at release is debuggable.
    try {
      const raw = await s.openSlot(hit.slot.url as string);
      log('RAW FORM (whitespace-collapsed, first 1500): ' + raw.replace(/\s+/g, ' ').slice(0, 1500));
    } catch {
      /* best-effort */
    }
  }

  await s.logout();
  await prisma.$disconnect();
})().catch((e) => {
  console.error(stamp(), 'FATAL', e);
  process.exit(1);
});
