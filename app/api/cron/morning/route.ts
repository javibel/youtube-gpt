import { authorizeCronDispatch, runCronDispatch } from '@/lib/cron-dispatch-original';
import { generateDailyTipOriginal } from '@/lib/daily-tip-original';
import { NextResponse } from 'next/server';
import { publishCronMorningSocial, consumeCronMorningPublication } from '@/lib/agent/content-generator';

// Twitter API desactivada — publicación migrada a Puppeteer en local-agent (brand-twitter-post.js)
// import { publishThreadToTwitter } from '@/lib/agent/twitter-agent';

// import { sendDailyReport } from '@/lib/agent/reports-agent'; // reporte diario desactivado 2026-08-30 (redundante con el Manager)
// sendOnboardingEmails DESACTIVADO 2026-07-01 (duplicaba lifecycle) — ver bloque "0." abajo.
// import { sendOnboardingEmails } from '@/lib/agent/onboarding-email';
import { sendVerificationReminders } from '@/lib/agent/verification-reminder';
import { sendReengagementEmails } from '@/lib/agent/reengagement-email';
import { sendDailyIdeasEmails } from '@/lib/daily-ideas-email';
import { generateDailyIdeas } from '@/lib/daily-ideas';

export const maxDuration = 120;

export async function GET(request: Request) {
  const original = authorizeCronDispatch(request, 'morning');
  if (!original) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runCronDispatch(original, async (step, issueDailyTip, issueDailyIdeas, issueDailyIdeasEmail, _issueSocialPost, _issueBrandImageRead, issueMorningSocial) => {
  const errors: string[] = [];
  const results: Record<string, unknown> = {};

  try {
    // 0. Onboarding email del agente — DESACTIVADO 2026-07-01 (Javier).
    //    MOTIVO: se solapaba con la secuencia lifecycle (lib/lifecycle-emails.ts,
    //    onboarding a1-a5), que cubre lo mismo mejor escalonado, con skip-on-action
    //    y link de baja (LSSI). Este mandaba un 2º nudge casi idéntico ~24-48h tras
    //    registro (ej. usuario Luis Avila recibió a1 "SEO Score" el 30/06 y este
    //    "3 cosas / conecta canal" el 01/07 → redundante). El lifecycle es la fuente
    //    única de onboarding a partir de ahora.
    //    PARA REACTIVAR: descomentar la llamada de abajo Y coordinar con el cron
    //    lifecycle para no duplicar (o borrar los pasos solapados a1/a3).
    //    Código intacto en lib/agent/onboarding-email.ts por si se reutiliza.
    // const onboardingSent = await sendOnboardingEmails().catch(err => {
    //   errors.push(`Onboarding: ${err instanceof Error ? err.message : err}`);
    //   return 0;
    // });
    results.onboarding = 'disabled_2026-07-01_dup_lifecycle';

    // 0b. Verification reminders to unverified signups (gated by VERIFY_REMINDER_ENABLED)
    const verifyReminders = await step(() => sendVerificationReminders()).catch(err => {
      errors.push(`VerifyReminder: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.verifyReminders = verifyReminders;

    // 0c. Re-engagement emails to dormant activated users (gated by REENGAGEMENT_ENABLED)
    const reengaged = await step(() => sendReengagementEmails()).catch(err => {
      errors.push(`Reengagement: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.reengaged = reengaged;

    // 1. Generate daily tip
    await step(() => generateDailyTipOriginal(issueDailyTip())).catch(err =>
      errors.push(`Daily tip: ${err instanceof Error ? err.message : err}`)
    );

    // 1b. Generate personalized daily ideas for Pro users
    const ideasGenerated = await step(() => generateDailyIdeas(issueDailyIdeas())).catch(err => {
      errors.push(`Daily ideas: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.dailyIdeas = typeof ideasGenerated === 'number' ? ideasGenerated : ideasGenerated.generated;
    if (typeof ideasGenerated !== 'number') results.dailyIdeasCoverage = ideasGenerated;

    // 1c. Deliver those ideas. Without this the cron writes them to the database and
    // nobody ever sees them — which is why users who connected a channel stopped
    // returning (docs: memory project-daily-ideas-briefing).
    const ideasEmailed = await step(() => sendDailyIdeasEmails(issueDailyIdeasEmail())).catch(err => {
      errors.push(`Daily ideas email: ${err instanceof Error ? err.message : err}`);
      return 0;
    });
    results.dailyIdeasEmailed = typeof ideasEmailed === 'number' ? ideasEmailed : ideasEmailed.providerAccepted;
    if (typeof ideasEmailed !== 'number') results.dailyIdeasEmailCoverage = ideasEmailed;

    // The native morning owner sequences both sources and publications. Only
    // the final private consumer can expose their jointly validated response.
    try {
      const receipt=await step(()=>publishCronMorningSocial(issueMorningSocial()));
      return await step(()=>consumeCronMorningPublication(receipt,async published=>{
        await published.validateBeforeResponse();
        const response=NextResponse.json({ok:errors.length===0,...(errors.length?{error:'cron_jobs_unconfirmed'}:{}),results:{...results,brandImage:published.brandImage,facebook:published.facebook,instagram:published.instagram},errors},{status:errors.length?503:200});
        await published.validateBeforeResponse();return response;
      }));
    } catch(error) {
      const message=(error as {message?:unknown}|null)?.message;
      const code=message==='daily_brand_image_unconfirmed'||message==='daily_brand_image_read_unconfirmed'?'daily_brand_image_unconfirmed':'social_publish_unconfirmed';
      return NextResponse.json({ok:false,error:code,results,errors},{status:503});
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/morning]', msg);

    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  }).catch(() => NextResponse.json({ ok: false, error: 'cron_invocation_unconfirmed' }, { status: 503 }));
}
