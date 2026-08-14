'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { saveBrsAccount } from '@/lib/brs-accounts';
import { parseBrsUrl } from '@/brs/parse';
import { BrsSession, toDatePath } from '@/brs/session';

export type AccountState = { error: string } | null;

/**
 * Add a BRS account from a pasted tee-sheet URL: derive club slug + platform + course
 * from the URL, then validate the login (and auto-detect the course if the URL didn't
 * include one) by actually logging in. The password is encrypted by saveBrsAccount.
 */
export async function addBrsAccountAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const url = String(formData.get('url') ?? '').trim();
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!url || !username || !password) {
    return { error: 'Paste your tee-sheet URL and enter your BRS username and password.' };
  }

  const parsed = parseBrsUrl(url);
  if (!parsed) {
    return {
      error: 'That does not look like a BRS address. Open your club tee sheet in BRS and paste the full web address.',
    };
  }
  if (parsed.platform === 'legacy') {
    return { error: 'That club uses the older BRS system, which is not supported yet.' };
  }

  const session = new BrsSession({ clubSlug: parsed.slug });
  try {
    await session.login(username, password);
  } catch {
    return { error: 'Could not log in to BRS with that username and password. Please double-check them.' };
  }

  let courseId = parsed.courseId;
  if (!courseId) {
    const near = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
    courseId = (await session.detectBookableCourse(toDatePath(near)).catch(() => null)) ?? 1;
  }
  await session.logout().catch(() => {});

  await saveBrsAccount({
    userId: user.id,
    clubSlug: parsed.slug,
    platform: parsed.platform,
    courseId,
    username,
    password,
  });
  redirect('/dashboard');
}
