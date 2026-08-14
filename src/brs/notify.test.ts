import { expect, test } from 'vitest';
import { normalizeUkMobile, renderRunNotification } from './notify';

const base = {
  club: 'Monifieth',
  course: 'Ashludie',
  date: '2026/08/22',
  time: '07:46',
  size: 4,
  players: ['You', 'Alex', 'Sam', 'Jo'],
};

test('a win renders a booked subject/sms with the ref', () => {
  const n = renderRunNotification({ status: 'won', ...base, bookingRef: 'ABC123' });
  expect(n.subject).toContain('Booked');
  expect(n.subject).toContain('07:46');
  expect(n.sms).toMatch(/booked/i);
  expect(n.sms).toContain('07:46');
  expect(n.html).toContain('ABC123');
  expect(n.text).toContain('Ashludie');
});

test('a miss renders a "missed" message', () => {
  const n = renderRunNotification({ status: 'lost', ...base, reason: 'window elapsed' });
  expect(n.subject).toMatch(/missed/i);
  expect(n.sms).toMatch(/missed|didn.?t/i);
});

test('an error surfaces the reason', () => {
  const n = renderRunNotification({ status: 'error', ...base, reason: 'HTTP 500' });
  expect(n.subject).toMatch(/error|failed/i);
  expect(n.sms).toContain('HTTP 500');
});

test('normalizeUkMobile canonicalises UK mobiles and rejects landlines', () => {
  expect(normalizeUkMobile('07562460713')).toBe('447562460713');
  expect(normalizeUkMobile('+44 7562 460713')).toBe('447562460713');
  expect(normalizeUkMobile('447562460713')).toBe('447562460713');
  expect(normalizeUkMobile('0131 496 0000')).toBeNull(); // landline
  expect(normalizeUkMobile('')).toBeNull();
});
