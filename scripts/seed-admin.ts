/**
 * Seed the first admin user — run once to bootstrap the invite-only app (there
 * is no public signup; every other account is created from an admin invite).
 *
 *   npm run seed:admin -- <email> <name> <password>
 *   # or via env:
 *   ADMIN_EMAIL=me@club.uk ADMIN_NAME='Me' ADMIN_PASSWORD='…' npm run seed:admin
 *
 * `.env` is loaded so DATABASE_URL is available; the password is hashed by
 * createUser before it ever touches the database.
 */
import 'dotenv/config';
import { prisma } from '@/lib/db';
import { createUser } from '@/lib/users';

async function main() {
  const [argEmail, argName, argPassword] = process.argv.slice(2);
  const email = argEmail ?? process.env.ADMIN_EMAIL;
  const name = argName ?? process.env.ADMIN_NAME;
  const password = argPassword ?? process.env.ADMIN_PASSWORD;

  if (!email || !name || !password) {
    console.error(
      'Usage: npm run seed:admin -- <email> <name> <password>\n' +
        '   or set ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD in the environment.',
    );
    process.exit(1);
  }

  const user = await createUser({ email, name, password, isAdmin: true });
  console.log(`✓ Admin created: ${user.name} <${user.email}> (id ${user.id})`);
}

main()
  .catch((err) => {
    console.error('✗ Failed to seed admin:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
