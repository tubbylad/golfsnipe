import { beforeAll, beforeEach, expect, test } from 'vitest';
import _sodium from 'libsodium-wrappers';
import { prisma } from '@/lib/db';
import { createUser } from './users';
import { resetDb } from '../../test/reset-db';

// The vault reads BRS_VAULT_KEY at encrypt time; provide a valid 32-byte key
// for this suite (mirrors vault.test.ts). Real Postgres, real libsodium.
beforeAll(async () => {
  await _sodium.ready;
  process.env.BRS_VAULT_KEY = _sodium.to_base64(
    _sodium.randombytes_buf(_sodium.crypto_secretbox_KEYBYTES),
    _sodium.base64_variants.ORIGINAL,
  );
});

beforeEach(async () => {
  await resetDb();
});

const PLAINTEXT = 'super-secret-brs-pw';

async function makeUser() {
  return createUser({ email: 'owner@example.com', name: 'Owner', password: 'pw' });
}

test('saveBrsAccount never persists the plaintext password (stores cipher+nonce)', async () => {
  const { saveBrsAccount } = await import('./brs-accounts');
  const { decryptSecret } = await import('./vault');
  const user = await makeUser();

  const account = await saveBrsAccount({
    userId: user.id,
    clubSlug: 'st-andrews',
    platform: 'modern',
    courseId: 1,
    username: 'golfer1',
    password: PLAINTEXT,
  });

  // Read the RAW row straight from Postgres to prove what is actually stored.
  const row = await prisma.brsAccount.findUnique({ where: { id: account.id } });
  expect(row).not.toBeNull();

  // No column holds the plaintext, anywhere.
  const serialized = JSON.stringify(row);
  expect(serialized).not.toContain(PLAINTEXT);
  expect(row!.passwordCipher).not.toBe(PLAINTEXT);
  expect(row!.passwordNonce).not.toBe(PLAINTEXT);

  // ...but it decrypts back to the original via the vault.
  expect(await decryptSecret(row!.passwordCipher, row!.passwordNonce)).toBe(PLAINTEXT);

  // Other fields persisted as given.
  expect(row!.clubSlug).toBe('st-andrews');
  expect(row!.username).toBe('golfer1');
  expect(row!.courseId).toBe(1);
});

test('saveBrsAccount defaults platform to modern and courseId to 1', async () => {
  const { saveBrsAccount } = await import('./brs-accounts');
  const user = await makeUser();

  const account = await saveBrsAccount({
    userId: user.id,
    clubSlug: 'muirfield',
    username: 'golfer2',
    password: PLAINTEXT,
  });

  expect(account.platform).toBe('modern');
  expect(account.courseId).toBe(1);
});

test('saveBrsAccount honours an explicit legacy platform', async () => {
  const { saveBrsAccount } = await import('./brs-accounts');
  const user = await makeUser();

  const account = await saveBrsAccount({
    userId: user.id,
    clubSlug: 'legacy-club',
    platform: 'legacy',
    username: 'golfer3',
    password: PLAINTEXT,
  });

  expect(account.platform).toBe('legacy');
});

test('listBrsAccounts returns only the given user’s accounts (oldest first, with targets)', async () => {
  const { saveBrsAccount, listBrsAccounts } = await import('./brs-accounts');
  const user = await makeUser();
  const other = await createUser({ email: 'other@example.com', name: 'Other', password: 'pw' });

  const first = await saveBrsAccount({
    userId: user.id,
    clubSlug: 'club-a',
    username: 'u',
    password: PLAINTEXT,
  });
  const second = await saveBrsAccount({
    userId: user.id,
    clubSlug: 'club-b',
    username: 'u',
    password: PLAINTEXT,
  });
  await saveBrsAccount({
    userId: other.id,
    clubSlug: 'not-mine',
    username: 'u',
    password: PLAINTEXT,
  });

  const accounts = await listBrsAccounts(user.id);
  expect(accounts.map((a) => a.id)).toEqual([first.id, second.id]);
  expect(accounts.every((a) => a.userId === user.id)).toBe(true);
  // targets are included (empty for now) so the dashboard can render them.
  expect(accounts[0].targets).toEqual([]);
});
