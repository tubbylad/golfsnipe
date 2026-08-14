import { beforeEach, expect, test } from 'vitest';
import { resetDb } from '../../test/reset-db';
import { consumeCode, issueLoginCode } from './otp-auth';

const SECRET = 'test-secret';
const wrongOf = (code: string) => (code === '000000' ? '000001' : '000000');

beforeEach(async () => {
  await resetDb();
});

test('issue then consume the correct code succeeds exactly once', async () => {
  const issued = await issueLoginCode({
    email: 'A@x.com',
    phone: '447700900001',
    name: 'Al',
    purpose: 'signup',
    secret: SECRET,
  });
  expect(issued.ok).toBe(true);
  if (!issued.ok) return;

  // wrong code is rejected (and counts as an attempt)
  expect(
    await consumeCode({ email: 'a@x.com', code: wrongOf(issued.code), purpose: 'signup', secret: SECRET }),
  ).toMatchObject({ ok: false, reason: 'bad_code' });

  // right code succeeds and returns the stored details (email normalized)
  expect(
    await consumeCode({ email: 'a@x.com', code: issued.code, purpose: 'signup', secret: SECRET }),
  ).toMatchObject({ ok: true, email: 'a@x.com', phone: '447700900001', name: 'Al' });

  // it is single-use: the consumed code can't be used again
  expect(
    await consumeCode({ email: 'a@x.com', code: issued.code, purpose: 'signup', secret: SECRET }),
  ).toMatchObject({ ok: false, reason: 'no_code' });
});

test('codes are rate-limited per phone', async () => {
  for (let i = 0; i < 5; i++) {
    expect(
      (await issueLoginCode({ email: `u${i}@x.com`, phone: '447700900002', purpose: 'login', secret: SECRET })).ok,
    ).toBe(true);
  }
  expect(
    await issueLoginCode({ email: 'u6@x.com', phone: '447700900002', purpose: 'login', secret: SECRET }),
  ).toMatchObject({ ok: false, reason: 'rate_limited' });
});

test('a code for one purpose is not accepted for another', async () => {
  const issued = await issueLoginCode({ email: 'p@x.com', phone: '447700900003', purpose: 'signup', secret: SECRET });
  if (!issued.ok) return;
  expect(
    await consumeCode({ email: 'p@x.com', code: issued.code, purpose: 'login', secret: SECRET }),
  ).toMatchObject({ ok: false, reason: 'no_code' });
});
