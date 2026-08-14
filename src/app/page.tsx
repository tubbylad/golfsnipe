import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/**
 * Front door: send visitors straight into the app. Logged-in users land on the
 * dashboard; everyone else goes to the (invite-only) login. No public landing page.
 */
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? '/dashboard' : '/login');
}
