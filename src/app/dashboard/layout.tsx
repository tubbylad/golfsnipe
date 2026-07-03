import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/**
 * Server-side session guard for the whole /dashboard tree. Resolves the current
 * user from the session cookie and bounces to /login when there isn't a valid
 * session — so every dashboard page can assume an authenticated request.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return children;
}
