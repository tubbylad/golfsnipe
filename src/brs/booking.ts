/** A player seat in a booking: a golfer-id, -2 for a guest, or null to leave the seat open. */
export type PlayerSeat = number | null;

export interface BookingInput {
  /** CSRF token scraped from the just-opened booking form. */
  csrfToken: string;
  holes: 9 | 18;
  /** player_1..N — player_1 is the booker (from the form's pre-selected golfer-id). */
  players: PlayerSeat[];
  /** Parallel to `players`; true = that player takes a buggy (checkbox sent only when true). */
  buggies?: boolean[];
}

/**
 * Build the `application/x-www-form-urlencoded` body for
 * `POST /<club>/bookings/store/<course>/<YYYYMMDD>/<HHmm>`.
 * Not multipart; no `files=[]`; guest = -2; empty seat = blank; payment fields empty.
 */
export function buildBookingBody(input: BookingInput): string {
  const p = new URLSearchParams();
  p.set('_token', input.csrfToken);
  p.set('member_booking_form[holes]', String(input.holes));
  input.players.forEach((seat, i) => {
    const n = i + 1;
    p.set(`member_booking_form[player_${n}]`, seat == null ? '' : String(seat));
    if (input.buggies?.[i]) p.set(`member_booking_form[player_${n}_buggy]`, '1');
  });
  p.set('member_booking_form[vendor-tx-code]', '');
  p.set('member_booking_form[payment-amount]', '');
  p.set('member_booking_form[confirm_booking]', '');
  return p.toString();
}
