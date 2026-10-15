# Administrative empty account deletion

The legacy route imported Stripe, attempted cancellation and deleted even when
cancellation failed. This route now has a bounded contract: delete an empty
account after native administrator authorization and explicit confirmation of
the selected id/email. It never lists/cancels Stripe or invokes another provider.

Every current User relation must be absent, including stored OAuth credentials,
sessions, content, billing, shared memberships and permanent effect attempts.
Referral links and verification/reset tokens or admissions also deny deletion.
A new SDK relation fails closed until reviewed. Accounts containing data require
a separate retention/billing/deletion contract; this is not a general data purge.

Actor and target locks precede a separate permanent admission COMMIT. Only its
original acknowledged invocation can enter the effect transaction, recheck the
same actor/target and empty policy, and atomically delete/complete its attempt.
The attempt table has no FK/cascade/TTL. Old rows only restrict; they cannot
originate or resume authority after a lost acknowledgement or process loss.
Raw timestamp parameters are normalized to UTC; original dates never renew.

The page retains a private selection from the current stats reader, then sends
one DELETE with `X-YTV-Delete-Command`. It checks the exact command/actor/target
ACK before refreshing. Cancellation, stale selection/reader/session, hidden or
unfocused page and expiry retire it. Uncertainty never triggers a retry.

The additive SQL migration is local only and must run once against the identified
synthetic database with an owned executor. Tests create fresh targets and never
delete inherited accounts/rows. Local tests do not grant permission for real
deletion, Stripe, communications, ordinary startup, production or acceptance.
