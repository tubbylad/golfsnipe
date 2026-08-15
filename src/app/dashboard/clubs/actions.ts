'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { deleteBrsAccount } from '@/lib/brs-accounts';

/** Remove a connected club (and, by cascade, its snipes). Ownership is enforced. */
export async function removeBrsAccountAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const accountId = String(formData.get('accountId') ?? '');
  if (accountId) await deleteBrsAccount(user.id, accountId);

  revalidatePath('/dashboard/clubs');
  redirect('/dashboard/clubs');
}
