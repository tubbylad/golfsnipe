'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { findUserByEmail } from '@/lib/users';
import { createSession, setSessionCookie } from '@/lib/session';
import { consumeCode, issueLoginCode, normalizeEmail } from '@/lib/otp-auth';
import { sendSms } from '@/lib/notifications';
import { normalizeUkMobile } from '@/brs/notify';

/** Passwordless SMS-code auth: open signup (name+email+mobile) and login (email), both
 * verified by a 6-digit code texted to the mobile. Codes are hashed, expiring, rate-limited. */

export type CodeState = { error: string } | { sent: true; email: string } | null;

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

const secret = () => env.BRS_VAULT_KEY;

async function textCode(phone: string, code: string): Promise<void> {
  await sendSms(phone, `Your GolfSnipe login code is ${code}. It expires in 10 minutes.`);
}

function codeError(reason: string): string {
  switch (reason) {
    case 'expired':
      return 'That code has expired. Request a new one.';
    case 'too_many_attempts':
      return 'Too many attempts. Request a new code.';
    case 'no_code':
      return 'No current code found. Request a new one.';
    default:
      return 'That code is not correct.';
  }
}

export async function requestSignupCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const name = field(formData, 'name');
  const email = field(formData, 'email');
  const phoneRaw = field(formData, 'phone');
  if (!name || !email || !phoneRaw) return { error: 'Name, email and mobile number are all required.' };
  const phone = normalizeUkMobile(phoneRaw);
  if (!phone) return { error: 'Enter a valid UK mobile number.' };
  if (await findUserByEmail(email)) return { error: 'An account with that email already exists. Log in instead.' };

  const issued = await issueLoginCode({ email, phone, name, purpose: 'signup', secret: secret() });
  if (!issued.ok) return { error: 'Too many codes requested for that number. Please wait a while.' };
  await textCode(phone, issued.code);
  return { sent: true, email: normalizeEmail(email) };
}

export async function verifySignupCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = field(formData, 'email');
  const code = field(formData, 'code');
  if (!email || !code) return { error: 'Enter the code we texted you.' };

  const result = await consumeCode({ email, code, purpose: 'signup', secret: secret() });
  if (!result.ok) return { error: codeError(result.reason) };

  let user = null;
  try {
    user = await prisma.user.create({
      data: { email: result.email, name: result.name ?? result.email, phone: result.phone },
    });
  } catch {
    user = await findUserByEmail(result.email); // email taken in a race -> just log them in
  }
  if (!user) return { error: 'Could not create your account. Please try again.' };

  await setSessionCookie(await createSession(user.id));
  redirect('/dashboard');
}

export async function requestLoginCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = field(formData, 'email');
  if (!email) return { error: 'Enter your email.' };
  const user = await findUserByEmail(email);
  if (!user || !user.phone) {
    return { error: 'No account with that email and a mobile on file. Sign up first.' };
  }
  const issued = await issueLoginCode({ email, phone: user.phone, purpose: 'login', secret: secret() });
  if (!issued.ok) return { error: 'Too many codes requested. Please wait a while.' };
  await textCode(user.phone, issued.code);
  return { sent: true, email: normalizeEmail(email) };
}

export async function verifyLoginCodeAction(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const email = field(formData, 'email');
  const code = field(formData, 'code');
  if (!email || !code) return { error: 'Enter the code we texted you.' };

  const result = await consumeCode({ email, code, purpose: 'login', secret: secret() });
  if (!result.ok) return { error: codeError(result.reason) };
  const user = await findUserByEmail(result.email);
  if (!user) return { error: 'Account not found.' };

  await setSessionCookie(await createSession(user.id));
  redirect('/dashboard');
}
