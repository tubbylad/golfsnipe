import { expect, test } from 'vitest';
import { buildBookingBody } from './booking';

const parse = (s: string) => new URLSearchParams(s);

test('buildBookingBody sets token, holes, players and the empty payment/submit fields', () => {
  const body = parse(
    buildBookingBody({ csrfToken: 'TOK', holes: 18, players: [638, 1002, 1003, 1004] }),
  );
  expect(body.get('_token')).toBe('TOK');
  expect(body.get('member_booking_form[holes]')).toBe('18');
  expect(body.get('member_booking_form[player_1]')).toBe('638');
  expect(body.get('member_booking_form[player_4]')).toBe('1004');
  expect(body.get('member_booking_form[vendor-tx-code]')).toBe('');
  expect(body.get('member_booking_form[payment-amount]')).toBe('');
  expect(body.get('member_booking_form[confirm_booking]')).toBe('');
});

test('buildBookingBody encodes a guest as -2 and an empty seat as blank', () => {
  const body = parse(
    buildBookingBody({ csrfToken: 'T', holes: 18, players: [638, -2, null, null] }),
  );
  expect(body.get('member_booking_form[player_2]')).toBe('-2');
  expect(body.get('member_booking_form[player_3]')).toBe('');
  expect(body.get('member_booking_form[player_4]')).toBe('');
});

test('buildBookingBody adds a buggy flag only for players who take one', () => {
  const body = parse(
    buildBookingBody({ csrfToken: 'T', holes: 9, players: [638, 1002], buggies: [false, true] }),
  );
  expect(body.has('member_booking_form[player_1_buggy]')).toBe(false);
  expect(body.get('member_booking_form[player_2_buggy]')).toBe('1');
  expect(body.get('member_booking_form[holes]')).toBe('9');
});
