'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useLang } from '@/components/LangProvider';
import DashboardShell from '@/components/DashboardShell';
import { useOptimizeNative } from '@/lib/use-optimize-native';
import type { Video } from '@/lib/optimize-native-contract';
export default function OptimizePage(){
 const {data:session,status}=useSession(),lang=useLang(),t=(es:string,en:string)=>lang==='en'?en:es;
 const [videoId,setVideoId]=useState<string|null>(null),[source,setSource]=useState<Video|null>(null),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[tags,setTags]=useState(''),[advice,setAdvice]=useState(false),[confirm,setConfirm]=useState(false);
 const read=useOptimizeNative(session,status,'GET',{lang,videoId});
 const video=read.data?.kind==='detail'&&read.data.videos[0]===source?source:null;
 const draft={videoId:video?.videoId??'',title,description,tags:tags.split(',').map(v=>v.trim()).filter(Boolean)};
 const original={videoId:video?.videoId??'',title:video?.title??'',description:video?.description??'',tags:video?.tags??[]};
 const preview=useOptimizeNative(session,status,'POST',{lang,videoId:draft.videoId,draft});
 const save=useOptimizeNative(session,status,'PUT',{lang,videoId:draft.videoId,draft,original,categoryId:video?.categoryId??'',advice});
 useEffect(()=>{const v=read.data?.kind==='detail'?read.data.videos[0]:null;if(!v||v===source)return;setSource(v);setTitle(v.title);setDescription(v.description??'');setTags(v.tags?.join(', ')??'');setConfirm(false);},[read.data,source]);
 const busy=save.loading,changed=!!video&&(title!==original.title||description!==original.description||JSON.stringify(draft.tags)!==JSON.stringify(original.tags));
 const selected=videoId!==null;
 const count=(n:number|null)=>n===null?t('No informado','Not reported'):String(n);
 return <DashboardShell><div className="max-w-5xl mx-auto p-6 space-y-5">
 <h1 className="text-3xl font-bold">{t('Editor de metadatos','Metadata editor')}</h1>
 <p>{t('La rúbrica local es una convención editorial; no mide calidad oficial, posicionamiento ni cambios de CTR. Los contadores acumulados no demuestran efectos de una edición.','The local rubric is an editorial convention; it does not measure official quality, ranking or CTR changes. Lifetime counters do not establish an edit’s impact.')}</p>
 <button type="button" disabled={busy||!read.canAnalyze} onClick={read.analyze}>{t('Consultar vídeos / actualizar selección','Load videos / refresh selection')}</button>
 {selected&&<button type="button" disabled={busy} onClick={()=>{setVideoId(null);setConfirm(false);}}>{t('Volver a la muestra','Back to sample')}</button>}
 {read.loading&&<p role="status">{t('Consultando…','Loading…')}</p>}{read.error&&<p role="alert">{t('Consulta sin confirmar. No se renueva la conexión automáticamente.','Read unconfirmed. The connection is not refreshed automatically.')}</p>}
 {read.data?.kind==='list'&&<section><h2>{t('Hasta 20 uploads de la primera página','Up to 20 uploads from the first page')}</h2><p>{t('Cobertura y frescura no informadas.','Coverage and freshness are not reported.')} {read.data.hasMore?t('Hay páginas sin consultar.','There are unread pages.'):''}</p>{read.data.videos.map(v=><article key={v.videoId} className="border p-3"><button type="button" disabled={busy} onClick={()=>{setVideoId(v.videoId);setConfirm(false);}}>{v.title}</button><p>{t('Vistas acumuladas: ','Lifetime views: ')}{count(v.views)}</p></article>)}{read.data.unavailableVideoIds.length>0&&<p>{t('Metadatos no disponibles: ','Metadata unavailable: ')}{read.data.unavailableVideoIds.join(', ')}</p>}</section>}
 {selected&&!video&&<p>{t('Consulta la selección para abrir sus datos propios.','Load the selection to open its owned metadata.')}</p>}
 {video&&<section className="space-y-4" aria-busy={busy}><h2>{video.title}</h2><p>{t('Vistas acumuladas: ','Lifetime views: ')}{count(video.views)} · {t('Me gusta: ','Likes: ')}{count(video.likes)} · {t('Comentarios: ','Comments: ')}{count(video.comments)}</p>
 {!video.editable?<p role="alert">{t('Faltan campos reportados; la publicación está deshabilitada para evitar sobrescribir datos desconocidos.','Reported fields are missing; publishing is disabled to avoid overwriting unknown metadata.')}</p>:<>
 <label className="block">{t('Título','Title')}<input className="block w-full" value={title} maxLength={100} disabled={busy} onChange={e=>{setTitle(e.target.value);setConfirm(false);}}/></label>
 <label className="block">{t('Descripción','Description')}<textarea className="block w-full" value={description} maxLength={5000} disabled={busy} onChange={e=>{setDescription(e.target.value);setConfirm(false);}}/></label>
 <label className="block">{t('Etiquetas separadas por comas','Comma-separated tags')}<input className="block w-full" value={tags} disabled={busy} onChange={e=>{setTags(e.target.value);setConfirm(false);}}/></label>
 <button type="button" disabled={busy||!preview.canAnalyze} onClick={preview.analyze}>{t('Calcular rúbrica del borrador','Calculate draft rubric')}</button>
 {preview.data?.rubric&&<p role="status">{t('Rúbrica de este borrador: ','This draft’s rubric: ')}{preview.data.rubric.score}/100 {t('(convención local)','(local convention)')}</p>}
 <p>{t('Se conservarán la categoría y el idioma predeterminado reportados por YouTube. Otra edición externa entre lectura y publicación sigue siendo posible.','The category and default language reported by YouTube will be preserved. An external edit between the read and publication remains possible.')}</p>
 <label className="block"><input type="checkbox" checked={advice} disabled={busy} onChange={e=>setAdvice(e.target.checked)}/>{t('Pedir una hipótesis editorial de IA después de guardar','Request an AI editorial hypothesis after saving')}</label>
 <label className="block"><input type="checkbox" checked={confirm} disabled={busy||!changed} onChange={e=>setConfirm(e.target.checked)}/>{t('Confirmo la publicación de este borrador en mi vídeo','I confirm publishing this draft to my video')}</label>
 <button type="button" disabled={busy||!confirm||!changed||!save.canAnalyze} onClick={save.analyze}>{t('Publicar metadatos','Publish metadata')}</button>
 </>}
 {save.loading&&<p role="status">{t('Publicación pendiente de acuse…','Publication awaiting acknowledgement…')}</p>}
 {save.error&&<p role="alert">{t('Publicación sin confirmar. No repitas el envío; leer el historial no autoriza un reintento.','Publication unconfirmed. Do not repeat the submission; reading history does not authorize a retry.')}</p>}
 {save.blocked&&!save.loading&&!save.data&&<p role="alert">{t('Existe una publicación pendiente o incierta para este vídeo.','A pending or uncertain publication exists for this video.')}</p>}
 {save.data?.kind==='saved'&&<p role="status">{t('Publicación e historial confirmados por esta solicitud. Actualiza la selección para consultar los datos posteriores.','Publication and history confirmed by this request. Refresh the selection to read subsequent metadata.')} {save.data.tip}</p>}
 <h3>{t('Historial: hasta 20 cambios anteriores','History: up to 20 prior changes')}</h3><p>{t('Son registros históricos, no prueba actual de calidad, frescura ni impacto.','These are historical records, not current evidence of quality, freshness or impact.')}</p>
 {read.data?.history.map(h=><article key={h.id}><p>{h.createdAt} · {h.field}</p><pre className="whitespace-pre-wrap">{h.oldValue}</pre><pre className="whitespace-pre-wrap">{h.newValue}</pre></article>)}
 </section>}
 </div></DashboardShell>;
}
