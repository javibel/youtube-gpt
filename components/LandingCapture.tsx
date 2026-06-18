'use client';

import { useEffect } from 'react';

/**
 * Captures the first page the visitor landed on into sessionStorage ('ytv_landing'),
 * read later by the signup form for attribution. Replaces an inline
 * dangerouslySetInnerHTML <script> in the root layout (which Guardian flagged as a
 * potential XSS, a false positive since the content was a static constant) with a
 * native client effect. Runs once on first mount, well before the user reaches signup.
 */
export default function LandingCapture() {
  useEffect(() => {
    try {
      if (!sessionStorage.getItem('ytv_landing')) {
        sessionStorage.setItem('ytv_landing', location.pathname + location.search);
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) — non-critical
    }
  }, []);

  return null;
}
