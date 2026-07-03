import { prisma } from '@/lib/db';
import { encryptSecret } from '@/lib/vault';
import type { BrsAccount, BrsPlatform } from '@/generated/prisma/client';

export interface SaveBrsAccountInput {
  userId: string;
  clubSlug: string;
  platform?: BrsPlatform;
  courseId?: number;
  username: string;
  password: string;
}

/**
 * Persist a BRS login. The password is encrypted through the vault BEFORE it
 * touches the database — only the ciphertext + nonce are stored, never the
 * plaintext (which is discarded once encrypted). Platform defaults to `modern`
 * and course id to 1, matching the BRS default course.
 */
export async function saveBrsAccount(input: SaveBrsAccountInput): Promise<BrsAccount> {
  const { cipher, nonce } = await encryptSecret(input.password);
  return prisma.brsAccount.create({
    data: {
      userId: input.userId,
      clubSlug: input.clubSlug,
      platform: input.platform ?? 'modern',
      courseId: input.courseId ?? 1,
      username: input.username,
      passwordCipher: cipher,
      passwordNonce: nonce,
    },
  });
}

/**
 * List a user's BRS accounts, oldest first, with their targets included so the
 * dashboard can render each account and its tee-time targets in one query.
 * Never returns the decrypted password — the ciphertext columns are only read
 * back at snipe time.
 */
export async function listBrsAccounts(userId: string) {
  return prisma.brsAccount.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { targets: true },
  });
}
