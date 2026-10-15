# Manual administrative grant

The native Auth.js cookie, verified administrator and original bounded request
originate one private grant. Only Pro/Business and1–365 days are supported.
Existing subscriptions are restrictions: no cancellation, update or renewal.

The additive SQL in `scripts/migration/sql/admin-manual-grant-attempt.sql` creates
one purpose-specific table. It is accessed through fixed, parameterized Prisma
raw queries, so it requires no generated SDK change. It must be applied once by
an owned executor to the identified synthetic database. Application startup does
not apply DDL. This is not permission to migrate or operate production.

Admission locks and captures the target id/email before inserting permanent
unique command, target id/email and subscription id fences. Its independent
transaction must acknowledge COMMIT before an effect transaction starts. That
same original rechecks native administrator and target locks, restricts against
its own pending row, creates the fixed subscription, and completes its attempt
atomically. A lost ACK remains uncertain. Other modules/workers may only deny;
they cannot adopt/resume an attempt or renew its original dates from stored data.
No cleanup, TTL, reset, status-based retry or recovery API exists.

AdminPage uses a captured single POST with `X-YTV-Grant-Command`. The client
checks exact actor, command, target, plan, duration and original dates before
displaying success or refreshing statistics. Form/session/view changes, loss of
focus/visibility and expiry retire it without retry. A client receipt is a local
display acknowledgement, never business authority or operational acceptance.

Directed contracts cover installed native authentication, fixed SQL, concurrent
independent modules, lost acknowledgements, atomic rollback, existing row
preservation and actual page/hook/server integration. All targets are newly
created synthetic accounts. No provider, Stripe, email or real account is used.
