/**
 * Mint a single-use invite and print its signup link. Admin-run (there is no
 * public signup): send the printed URL to the person you want to let in.
 *
 *   npm run invite                     # unrestricted invite
 *   npm run invite -- guest@club.uk    # optional intended-recipient note
 *
 * The link is `${APP_ORIGIN}/signup?token=<token>` and expires in 7 days.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { createInvite } from '@/lib/invites';
import { env } from '@/lib/env';

async function main() {
  const email = process.argv.slice(2)[0]; // optional
  const token = await createInvite(email);
  const url = `${env.APP_ORIGIN}/signup?token=${token}`;
  console.log(`✓ Invite created${email ? ` for ${email}` : ''} (expires in 7 days):`);
  console.log(url);
}

main()
  .catch((err) => {
    console.error('✗ Failed to create invite:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
