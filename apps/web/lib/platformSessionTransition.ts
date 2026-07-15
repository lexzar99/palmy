export type PlatformSessionTransitionInput = {
  /** True when the server received a non-empty HttpOnly platform cookie. */
  hadPreviousCookie: boolean;
  /** Parsed USER subject from that cookie, or null when the cookie is malformed. */
  previousCookieCustomerId: string | null;
  /** Non-secret browser continuity hint written only after a verified session POST. */
  previousCustomerMarker: string | null;
  /** Subject from the newly verified platform token. */
  nextCustomerId: string;
};

export type PlatformSessionTransition = {
  clearCustomerState: boolean;
  revokePush: boolean;
  reason:
    | "verified_cookie_same_customer"
    | "cookie_invalid_or_customer_changed"
    | "missing_cookie_marker_same_customer"
    | "missing_cookie_marker_changed_customer"
    | "guest_to_first_customer";
};

/**
 * Browser continuity is deliberately split into two decisions:
 *
 * - PushManager may outlive both cookies and storage. An absent server cookie
 *   therefore always revokes the old browser subscription, even for a genuine
 *   guest or the same returning customer.
 * - A guest cart/order session is useful continuity, not evidence of account
 *   ownership. It is preserved for first login and same-marker recovery, while
 *   a definite account change clears all customer state and order cookies.
 *
 * The marker never grants API/order access; every such request still requires
 * the verified account cookie or an HttpOnly order capability.
 */
export function classifyPlatformSessionTransition({
  hadPreviousCookie,
  previousCookieCustomerId,
  previousCustomerMarker,
  nextCustomerId,
}: PlatformSessionTransitionInput): PlatformSessionTransition {
  if (hadPreviousCookie) {
    const sameCustomer = previousCookieCustomerId === nextCustomerId;
    return sameCustomer
      ? {
          clearCustomerState: false,
          revokePush: false,
          reason: "verified_cookie_same_customer",
        }
      : {
          clearCustomerState: true,
          revokePush: true,
          reason: "cookie_invalid_or_customer_changed",
        };
  }

  if (previousCustomerMarker) {
    const sameCustomer = previousCustomerMarker === nextCustomerId;
    return sameCustomer
      ? {
          clearCustomerState: false,
          revokePush: true,
          reason: "missing_cookie_marker_same_customer",
        }
      : {
          clearCustomerState: true,
          revokePush: true,
          reason: "missing_cookie_marker_changed_customer",
        };
  }

  return {
    clearCustomerState: false,
    revokePush: true,
    reason: "guest_to_first_customer",
  };
}
