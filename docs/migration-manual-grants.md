# Manual Pro grants in the independent migration copy

Manual administrator grants can now supply `durationDays` (1–365). A 60-day review grant is represented by `durationDays: 60`, `stripeCustomerId: 'manual_admin'`, and an explicit `currentPeriodEnd`. Access checks treat that marker as Pro only while the recorded end is in the future. The extension, account stats, lifecycle and administrative readers use the same rule. Stripe-managed subscriptions continue to use their Stripe status and cannot be overwritten by the manual grant route or script.

The legacy administrative request without `durationDays` still uses its prior ten-year duration, and the older CLI grant still uses one year. Neither should be used for a short editorial trial. Legacy records without the `manual_admin` marker need a separate inventory before any migration; they are not automatically reclassified. This is verified only in the local copy. It does not activate or alter a real user account.
