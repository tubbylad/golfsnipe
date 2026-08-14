'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { decryptSecret } from '@/lib/vault';
import { BrsSession } from '@/brs/session';
import { matchMembers, type Member } from '@/brs/parse';

/**
 * Server Actions for Buddies (Players). Adding a real buddy resolves their name
 * to a BRS golfer-id against the club roster: log in with one of the caller's
 * accounts, fetch the roster, and match locally. A unique match saves straight
 * away; multiple matches are returned for the user to disambiguate; the pick is
 * then trusted (no second round-trip). Every path re-reads the session and
 * verifies account ownership first. `redirect()` is only called OUTSIDE the
 * try/catch that wraps the network calls.
 */

export type BuddyMatch = { golferId: string; label: string };
export type BuddyState =
  | null
  | { error: string }
  | { ambiguous: BuddyMatch[]; name: string; accountId: string };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function addBuddyAction(_prev: BuddyState, formData: FormData): Promise<BuddyState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accountId = field(formData, 'accountId');
  const name = field(formData, 'name').trim();
  const explicitGolferId = field(formData, 'golferId').trim();
  const explicitDisplayName = field(formData, 'displayName').trim();

  if (!name) return { error: "Enter the buddy's name as it appears at the club." };

  const account = await prisma.brsAccount.findFirst({
    where: { id: accountId, userId: user.id },
  });
  if (!account) return { error: 'Pick one of your BRS accounts to search its club roster.' };

  // Disambiguation step: a specific golfer was chosen, so trust it (no lookup).
  if (explicitGolferId) {
    if (!/^\d+$/.test(explicitGolferId)) return { error: 'That golfer selection was invalid.' };
    await prisma.player.create({
      data: {
        userId: user.id,
        displayName: explicitDisplayName || name,
        brsGolferId: explicitGolferId,
        isGuest: false,
      },
    });
    redirect('/dashboard/buddies');
  }

  // First step: log in and match the typed name against the live roster.
  let matches: Member[] = [];
  try {
    const password = await decryptSecret(account.passwordCipher, account.passwordNonce);
    const session = new BrsSession({ clubSlug: account.clubSlug });
    await session.login(account.username, password);
    const roster = await session.getRoster();
    matches = matchMembers(roster, name);
  } catch {
    return {
      error: 'Could not reach BRS to look up members. Check the account login and try again.',
    };
  }

  if (matches.length === 0) {
    return {
      error: `No members at ${account.clubSlug} matched "${name}". Try "First Last" or the surname.`,
    };
  }
  // Always confirm before saving — even a single match — so a mistyped name never
  // silently adds the wrong person.
  return {
    ambiguous: matches.map((m) => ({
      golferId: String(m.golferId),
      label: `${m.firstName} ${m.lastName}`.trim() || m.initials,
    })),
    name,
    accountId: account.id,
  };
}

/** Remove a buddy/guest the caller owns. Ownership is enforced in the where-clause. */
export async function deleteBuddyAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const playerId = field(formData, 'playerId');
  if (playerId) {
    await prisma.player.deleteMany({ where: { id: playerId, userId: user.id } });
  }
  revalidatePath('/dashboard/buddies');
  redirect('/dashboard/buddies');
}

/** Add a guest Player (no roster lookup; booked into the -2 guest seat later). */
export async function addGuestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const displayName = field(formData, 'displayName').trim();
  if (!displayName) redirect('/dashboard/buddies');

  await prisma.player.create({
    data: { userId: user.id, displayName, isGuest: true },
  });
  redirect('/dashboard/buddies');
}
