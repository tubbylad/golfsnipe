import { prisma } from '@/lib/db';
import { generateCode, hashCode, verifyCode } from '@/lib/otp';
import type { CodePurpose } from '@/generated/prisma/client';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODES_PER_PHONE_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type IssueResult = { ok: true; code: string } | { ok: false; reason: 'rate_limited' };
export type ConsumeResult =
  | { ok: true; email: string; phone: string; name: string | null }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'bad_code' };

/**
 * Create a one-time code for an email/phone, storing it hashed. Rate-limited per
 * phone. Returns the plaintext code for the caller to SMS (never persisted plainly).
 */
export async function issueLoginCode(input: {
  email: string;
  phone: string;
  name?: string | null;
  purpose: CodePurpose;
  secret: string;
}): Promise<IssueResult> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.loginCode.count({
    where: { phone: input.phone, createdAt: { gte: since } },
  });
  if (recent >= MAX_CODES_PER_PHONE_PER_HOUR) return { ok: false, reason: 'rate_limited' };

  const code = generateCode();
  await prisma.loginCode.create({
    data: {
      email: normalizeEmail(input.email),
      phone: input.phone,
      name: input.name ?? null,
      codeHash: hashCode(code, input.secret),
      purpose: input.purpose,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return { ok: true, code };
}

/**
 * Verify + single-use consume the newest unconsumed code for an email/purpose.
 * Wrong codes increment attempts (locking out after MAX_ATTEMPTS). On success the
 * row is marked consumed and the stored email/phone/name are returned.
 */
export async function consumeCode(input: {
  email: string;
  code: string;
  purpose: CodePurpose;
  secret: string;
}): Promise<ConsumeResult> {
  const email = normalizeEmail(input.email);
  const row = await prisma.loginCode.findFirst({
    where: { email, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return { ok: false, reason: 'no_code' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (!verifyCode(input.code, row.codeHash, input.secret)) {
    await prisma.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, reason: 'bad_code' };
  }
  await prisma.loginCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return { ok: true, email: row.email, phone: row.phone, name: row.name };
}
