'use client';

import { useEffect } from 'react';

/**
 * Captures the first page the visitor landed on into sessionStorage ('ytv_landing')
 * and the external referrer that brought them ('ytv_referrer'), read later by the
 * signup form for attribution. Replaces an inline dangerouslySetInnerHTML <script>
 * in the root layout (which Guardian flagged as a potential XSS, a false positive
 * since the content was a static constant) with a native client effect. Runs once
 * on first mount, well before the user reaches signup.
 *
 * The referrer MUST be captured here rather than on the signup page: by the time the
 * visitor navigates internally to /signup, document.referrer has been overwritten with
 * our own URL and the original source is gone.
 */
export default function LandingCapture() {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('ytv_landing')) {
        sessionStorage.setItem('ytv_landing', location.pathname + location.search);
      }
      // Store only once, and only if it is genuinely external — a same-origin referrer
      // means we already missed the real entry point, and recording it would bury the
      // "unknown" case under useless self-referrals.
      if (!sessionStorage.getItem('ytv_referrer') && document.referrer) {
        const host = new URL(document.referrer).hostname;
        if (host !== location.hostname) {
          sessionStorage.setItem('ytv_referrer', document.referrer);
        }
      }
    } catch {
      // sessionStorage or URL parsing unavailable (private mode, malformed referrer) — non-critical
    }
  }, []);

  return null;
}
