import { keyedRemoval } from '@/lib/image/removal-attempt';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserPlan, isPaid } from '@/lib/plans';
import { rateLimitDb } from '@/lib/rate-limit-db';
import { MAX_REMOVAL_BYTES, RemovalUnavailable, isRemovalAvailable, removeBackgroundImage } from '@/lib/image/remove-background-provider';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) return NextResponse.json({ error:'No autorizado' },{status:401});
    const user = await prisma.user.findUnique({where:{email:session.user.email},select:{id:true}});
    if (!user || user.id !== session.user.id) return NextResponse.json({error:'No autorizado'},{status:401});
    let form: FormData;
    try { form = await req.formData(); }
    catch { return NextResponse.json({error:'Archivo no válido'},{status:400}); }
    const file = form.get('file');
    if (!file || typeof file === 'string' || !file.size || !['image/png','image/jpeg','image/webp'].includes(file.type)) {
      return NextResponse.json({error:'Archivo no válido'},{status:400});
    }
    if (file.size > MAX_REMOVAL_BYTES) return NextResponse.json({error:'Imagen demasiado grande (máx 10MB)'},{status:413});
    const key=req.headers.get('Idempotency-Key');
    if(key!==null&&!/^[-A-Za-z0-9._:]{1,128}$/.test(key))return NextResponse.json({error:'Clave inválida'},{status:400});
    const recovery=req.headers.get('X-Removal-Recovery');
    if(recovery!==null&&(recovery!=='retained-only-v1'||key===null))return NextResponse.json({error:'Consulta original inválida'},{status:400});
    if(key!==null)return await keyedRemoval(user.id,key,file,req.signal,async()=>{
      if(!isPaid(await getUserPlan(user.id)))return NextResponse.json({error:'pro_required'},{status:403});
      if(!isRemovalAvailable())return NextResponse.json({code:'image_service_unavailable'},{status:503});
      return ()=>removeBackgroundImage(file,req.signal);
    },recovery==='retained-only-v1');
    const plan = await getUserPlan(user.id);
    if (!isPaid(plan)) return NextResponse.json({error:'pro_required'},{status:403});
    if (!isRemovalAvailable()) throw new RemovalUnavailable();
    if (req.signal.aborted) return NextResponse.json({error:'Solicitud cancelada localmente',code:'image_result_unconfirmed',retryMayConsume:true},{status:503});
    if (!await rateLimitDb(`remove-bg:${user.id}`,20,60,true)) return NextResponse.json({error:'No se pudo admitir la solicitud. Inténtalo en unos minutos.'},{status:429});
    const png = await removeBackgroundImage(file,req.signal);
    return new NextResponse(new Blob([png],{type:'image/png'}),{
      headers:{'Content-Type':'image/png','Cache-Control':'no-store'},
    });
  } catch (error) {
    if (error instanceof RemovalUnavailable) return NextResponse.json({error:'Servicio no disponible',code:'image_service_unavailable',retryMayConsume:false},{status:503});
    // No provider body, credentials or image data in errors/logs. Never automatic retry/fallback.
    return NextResponse.json({error:'Resultado sin confirmar. Repetir puede consumir de nuevo.',code:'image_result_unconfirmed',retryMayConsume:true},{status:503});
  }
}
