import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-guards';
import { authorizeNativeAdminSocialPreview, checkNativeAdminSocialPreview, closeNativeAdminSocialPreview, acknowledgeNativeAdminSocialPreview } from '@/lib/admin-social-preview-native';
import { generateAdminSocialPreview } from '@/lib/agent/content-generator';

export const maxDuration=60;

export async function POST(request: Request) {
  if(request.headers.has('x-ytv-social-youtube-draft-command')){const{handleAdminSocialYoutubeDraft}=await import('@/lib/admin-social-messages');return handleAdminSocialYoutubeDraft(request);}
  if(request.headers.has('x-ytv-social-messages-draft-command')){const{handleAdminSocialMessagesDraft}=await import('@/lib/admin-social-messages');return handleAdminSocialMessagesDraft(request);}
  if(request.headers.has('x-ytv-social-messages-draft-source-command')){const{handleAdminSocialMessagesDraftSource}=await import('@/lib/admin-social-messages');return handleAdminSocialMessagesDraftSource(request);}
  if (request.headers.has('x-ytv-social-messages-command')) {
    const { handleAdminSocialMessages } = await import('@/lib/admin-social-messages');
    return handleAdminSocialMessages(request);
  }
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let action: unknown;
  try { ({ action } = await request.clone().json()); }
  catch { return NextResponse.json({ok:false,error:'invalid_social_action'},{status:400,headers:{'Cache-Control':'no-store'}}); }
  // action: 'publish' | 'messages' | 'test'
  // type: 'morning' | 'evening' (for publish/test)

  try {
    if (action === 'test') {
      const original=await authorizeNativeAdminSocialPreview(request);
      if(!original)return NextResponse.json({ok:false,error:'social_preview_unconfirmed'},{status:403,headers:{'Cache-Control':'no-store'}});
      try{
        const preview=await generateAdminSocialPreview(original);checkNativeAdminSocialPreview(original);
        const response=NextResponse.json({ok:true,preview,socialPreview:acknowledgeNativeAdminSocialPreview(original)},{headers:{'Cache-Control':'no-store'}});
        checkNativeAdminSocialPreview(original);return response;
      }catch{return NextResponse.json({ok:false,error:'social_preview_unconfirmed'},{status:503,headers:{'Cache-Control':'no-store'}});}
      finally{closeNativeAdminSocialPreview(original);}
    }
    if (action === 'publish') {
      const { handleAdminSocialPublication } = await import('@/lib/admin-social-publication');
      return handleAdminSocialPublication(request);
    }

    if(action==='messages-youtube-draft'){const{handleAdminSocialYoutubeDraft}=await import('@/lib/admin-social-messages');return handleAdminSocialYoutubeDraft(request);}
    if(action==='messages-draft'){const{handleAdminSocialMessagesDraft}=await import('@/lib/admin-social-messages');return handleAdminSocialMessagesDraft(request);}
    if(action==='messages-draft-source'){const{handleAdminSocialMessagesDraftSource}=await import('@/lib/admin-social-messages');return handleAdminSocialMessagesDraftSource(request);}
    if (action === 'messages') {
      const { handleAdminSocialMessages } = await import('@/lib/admin-social-messages');
      return handleAdminSocialMessages(request);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[agent/run]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
