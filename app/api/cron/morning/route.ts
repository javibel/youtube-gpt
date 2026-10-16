import { authorizeCronDispatch, runCronDispatch } from '@/lib/cron-dispatch-original';
import { generateDailyTipOriginal } from '@/lib/daily-tip-original';
import { NextResponse } from 'next/server';
import { generateSocialPost } from '@/lib/agent/content-generator';
import {
  publishToFacebook,
  publishToFacebookWithImage,
  publishToInstagram,
} from '@/lib/agent/meta-agent';
import { getOrCreateDailyBrandImage } from '@/lib/agent/ideogram-image';
import { buildInfographicUrl } from '@/lib/agent/infographic-generator';
// Twitter API desactivada — publicación migrada a Puppeteer en local-agent (brand-twitter-post.js)
// import { publishThreadToTwitter } from '@/lib/agent/twitter-agent';
import { sendNotificationEmail } from '@/lib/agent/gmail-agent';
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

  return runCronDispatch(original, async (step, issueDailyTip, issueDailyIdeas, issueDailyIdeasEmail, issueSocialPost) => {
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

    // 2. Generate content for Facebook + Instagram (LinkedIn + Twitter desactivados)
    const [facebook, instagram] = await Promise.allSettled([
      step(() => generateSocialPost('facebook', 'morning', issueSocialPost('facebook'))),
      step(() => generateSocialPost('instagram', 'morning', issueSocialPost('instagram'))),
    ]);

    const fb = facebook.status === 'fulfilled' ? facebook.value : null;
    const ig = instagram.status === 'fulfilled' ? instagram.value : null;
    const tw = null; // Twitter API desactivada — migrado a Puppeteer local-agent

    if (facebook.status === 'rejected') errors.push(`Facebook content: ${facebook.reason}`);
    if (instagram.status === 'rejected') errors.push(`Instagram content: ${instagram.reason}`);

    // 3. One shared AI image for the whole day (FB + IG + the local-agent Twitter
    //    post all reuse it) to avoid duplicate Ideogram generations. Falls back to a
    //    per-platform Satori infographic only if Ideogram itself fails.
    const sharedAiUrl = (fb || ig) ? await step(() => getOrCreateDailyBrandImage((fb || ig) as string)) : null;
    const fbImageUrl = fb ? (sharedAiUrl ?? buildInfographicUrl(fb)) : null;
    const igImageUrl = ig ? (sharedAiUrl ?? buildInfographicUrl(ig)) : null;

    // 3a. Publish Facebook with AI image (via Graph API)
    if (fb && fbImageUrl) {
      const fbResult = await step(() => publishToFacebookWithImage(fb, fbImageUrl));
      results.facebook = fbResult;
      if (!fbResult.success && !fbResult.skipped) errors.push(`Facebook: ${fbResult.error}`);
    }

    // 3b. Publish Instagram + Twitter in parallel (both independent)
    const socialPublishTasks: Promise<void>[] = [];

    if (ig) {
      socialPublishTasks.push((async () => {
        const igResult = await step(() => publishToInstagram(ig, igImageUrl ?? undefined));
        results.instagram = igResult;
        if (!igResult.success && !igResult.skipped) errors.push(`Instagram: ${igResult.error}`);
      })());
    }

    // Twitter/X — DESACTIVADO: API de pago, migrado a Puppeteer en local-agent (brand-twitter-post.js)
    if (tw) {
      results.twitter = { success: false, error: 'Twitter API desactivada — publicación via Puppeteer en local-agent' };
    }

    await Promise.allSettled(socialPublishTasks);

    // 6. Reporte diario al owner — DESACTIVADO 2026-08-30 (decisión Javier).
    //    Era el segundo reporte diario redundante (el otro, local-agent/reports.js,
    //    se apagó el 28/08). El Reporte Ejecutivo del Manager (03:15) ya cubre
    //    posts sociales y gmail; las secciones de LinkedIn/YCML llevan meses en
    //    "sin datos" (personas abandonadas). Código intacto en lib/agent/reports-agent.ts.
    // await sendDailyReport().catch(err =>
    //   errors.push(`Daily report: ${err instanceof Error ? err.message : err}`)
    // );

    if (errors.length > 0) {
      await step(() => sendNotificationEmail(
        '[YTubViral Agent] Errores en cron matutino',
        errors.join('\n')
      )).catch(() => {});
    }

    return NextResponse.json({ ok: true, results, errors });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[cron/morning]', msg);
    await step(() => sendNotificationEmail('[YTubViral Agent] Error critico cron matutino', msg)).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
  }).catch(() => NextResponse.json({ ok: false, error: 'cron_invocation_unconfirmed' }, { status: 503 }));
}
