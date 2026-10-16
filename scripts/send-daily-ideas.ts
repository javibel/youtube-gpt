// Historical reset/regeneration CLI disabled in the independent migration copy.
// It cannot delete existing ideas,load credentials,mint a native cron purpose or send mail.
console.error('daily_ideas_cron_invocation_required: use the original authorized morning invocation; reset/regeneration is unavailable');
process.exitCode = 1;
export {};
