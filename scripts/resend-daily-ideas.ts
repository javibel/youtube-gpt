// Historical credential-loading/reset/resend CLI disabled in this migration copy.
// Neither dry-run nor send may remove an uncertain fence or mint a cron purpose.
console.error('daily_ideas_email_cron_invocation_required: reset/resend is unavailable; retain uncertain slots');
process.exitCode = 1;
export {};
