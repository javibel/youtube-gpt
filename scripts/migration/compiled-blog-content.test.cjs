'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const contract=require('../../contracts/ai/v1/compiled-blog.cjs');
const root=path.resolve(__dirname,'../..'),results=[];
const test=async(name,fn)=>{try{await fn();results.push({name,status:'PASS'});}catch(error){results.push({name,status:'FAIL',error:error.stack});}};
const value=(lang='es',suffix='a')=>({version:1,publicationId:'publication_'+suffix.repeat(64),payloadDigest:'d'.repeat(64),slug:'new-original-article',lang,cat:'youtube',readMin:7,publishedAt:'2026-10-26',author:{name:'Synthetic author',role:lang==='es'?'Autora de prueba':'Test author',avatar:'SA'},title:lang==='es'?'Título original único':'Unique original title',excerpt:lang==='es'?'Resumen aprobado':'Approved summary',blocks:[{type:'h2',t:lang==='es'?'Sección original':'Original section'},{type:'p',t:lang==='es'?'Texto visible aprobado':'Approved visible text'},{type:'list',items:['Uno','Dos']}],canonicalUrl:'https://ytubviral.com'+(lang==='en'?'/en':'')+'/blog/new-original-article'});
function site(deliveries=[],language='es'){
 const cache=new Map(),document={version:1,deliveries};
 function load(relative){
  const file=path.join(root,relative);if(cache.has(file))return cache.get(file).exports;
  const source=fs.readFileSync(file,'utf8'),compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,resolveJsonModule:true}}).outputText;
  const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(path.dirname(file));cache.set(file,m);
  m.require=id=>{
   if(id.endsWith('blog-deliveries.json'))return document;
   if(id.includes('compiled-blog.cjs'))return contract;
   if(id==='@/lib/server-lang')return{getServerLang:()=>language};
   if(id==='@/lib/blog-data')return load('lib/blog-data.ts');
   if(id==='@/lib/blog-seo')return{BLOG_SEO:{}};
   if(id==='@/lib/learn-data')return{LEARN_GUIDES:[]};
   if(id==='@/lib/gear-data')return{ALL_GEAR_SLUGS:[]};
   if(id==='@/lib/niches-data')return{NICHES:[]};
   if(id==='@/lib/title-study-data')return{TOPIC_SLUGS:[]};
   if(id==='next/navigation')return{notFound:()=>{throw Error('ORIGINAL_NOT_FOUND');}};
   if(id==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
   if(id==='next/image')return{__esModule:true,default:({fill,priority,...props})=>React.createElement('img',props)};
   if(id==='@/components/ArticleBlock')return load('components/ArticleBlock.tsx');
   if(id==='@/components/icons')return{BagIcon:()=>null};
   if(id==='@/components/WaitlistInline'||id==='./BlogFilter')return{__esModule:true,default:()=>null};
   if(id==='./BlogContent')return load('app/blog/BlogContent.tsx');
   if(id==='react'||id==='react/jsx-runtime')return require(id);
   throw Error('Unexpected offline page import: '+id);
  };
  m._compile(compiled,file);return m.exports;
 }
 return{data:()=>load('lib/blog-data.ts'),article:()=>load('app/blog/[slug]/page.tsx'),index:()=>load('app/blog/page.tsx'),rss:()=>load('app/blog/rss.xml/route.ts'),sitemap:()=>load('app/sitemap.ts')};
}
(async()=>{
 await test('bounded public delivery accepts only the selected language and original canonical',()=>{const es=value();assert.deepEqual(contract.validatePublicBlogDelivery(es),es);for(const mutate of [v=>v.lang='fr',v=>v.canonicalUrl+='/other',v=>v.publishedAt='2026-02-30',v=>v.readMin=Infinity,v=>v.author.secret='private',v=>v.privateSource='unapproved',v=>v.blocks=[{type:'p',t:'x',html:'<script>'}],v=>v.blocks=[{type:'callout-mid',t:'T',sub:'S',cta:'C',href:'//other.invalid'}]]){const changed=value();mutate(changed);assert.throws(()=>contract.validatePublicBlogDelivery(changed));}});
 await test('accessors and custom serialization cannot run during public validation',()=>{let reads=0;const v=value();Object.defineProperty(v,'title',{get(){reads++;throw Error('secret');},enumerable:true});assert.throws(()=>contract.validatePublicBlogDelivery(v));assert.equal(reads,0);const x=value();x.toJSON=()=>assert.fail('No serialization');assert.throws(()=>contract.validatePublicBlogDelivery(x));});
 await test('duplicate target or publication and inconsistent bilingual authorship are rejected',()=>{const es=value(),en=value('en','b');assert.equal(contract.appendPublicBlogDelivery({version:1,deliveries:[es]},en).deliveries.length,2);for(const changed of [value('es','c'),{...en,publicationId:es.publicationId},{...en,cat:'ai'},{...en,author:{...en.author,name:'Replacement author'}}])assert.throws(()=>contract.appendPublicBlogDelivery({version:1,deliveries:[es]},changed));});
 await test('empty delivery document preserves every existing article and body',()=>{const original=site().data();assert(original.BLOG_POSTS.length>20);assert.equal(original.getPosts('es').length,original.BLOG_POSTS.length);assert.equal(original.getPosts('en').length,original.BLOG_POSTS.length);for(const post of original.BLOG_POSTS)assert.equal(original.getPost(post.slug,'es'),post);});
 await test('all 37 original articles survive migration and the five later articles render through the public flow',async()=>{
  const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/original-blog-catalog-2026-10-01.json'),'utf8'));
  const hash=value=>require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(baseline.sourceCommit,'c92cccb3923f8b3ff68ddfcca88e85300e6d10a3');assert.equal(baseline.articles.length,37);assert.equal(baseline.restoredSlugs.length,5);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'lib/blog-deliveries.json'),'utf8')),{version:1,deliveries:[]});
  const data=site().data();assert.equal(data.BLOG_POSTS.length,37);
  for(const original of baseline.articles){
   assert.deepEqual(data.getPost(original.post.slug),original.post);
   for(const lang of ['es','en'])assert.equal(hash(data.ARTICLE_BODIES[original.post.slug][lang]),original.bodyDigests[lang]);
  }
  for(const lang of ['es','en']){
   const view=site([],lang),article=view.article(),params=await article.generateStaticParams();
   assert.equal(params.length,37);assert.equal(new Set(params.map(p=>p.slug)).size,37);
   const index=renderToStaticMarkup(view.index().default()),sitemap=view.sitemap().default(),feed=await view.rss().GET(),xml=await feed.text();
   for(const slug of baseline.restoredSlugs){
    const post=view.data().getPost(slug,lang);assert(post);assert(params.some(p=>p.slug===slug));
    const metadata=await article.generateMetadata({params:Promise.resolve({slug})});
    assert.equal(metadata.openGraph.title,post.title[lang]);assert.equal(metadata.alternates.canonical,'https://ytubviral.com'+(lang==='en'?'/en':'')+'/blog/'+slug);
    const html=renderToStaticMarkup(await article.default({params:Promise.resolve({slug})}));
    const escapedTitle=renderToStaticMarkup(React.createElement('span',null,post.title[lang])).slice(6,-7);
    assert(html.includes(escapedTitle));assert(html.length>1000);assert(!html.includes('id="ytv-blog-publication"'));
    assert(index.includes('/blog/'+slug));assert(sitemap.some(p=>p.url==='https://ytubviral.com/blog/'+slug));assert(xml.includes(slug));
   }
  }
 });
 for(const lang of ['es','en'])await test('one '+lang+' delivery is visible only in its approved language across real pages',async()=>{
  const delivery=value(lang),other=lang==='es'?'en':'es',s=site([delivery],lang),data=s.data();
  assert.equal(data.getPost(delivery.slug,lang).title[lang],delivery.title);assert.equal(data.getPost(delivery.slug,other),undefined);
  assert(data.getPosts(lang).some(p=>p.slug===delivery.slug));assert(!data.getPosts(other).some(p=>p.slug===delivery.slug));assert.deepEqual(data.ARTICLE_BODIES[delivery.slug][other],[]);
  assert(!data.getRelated('another','youtube',100,other).some(p=>p.slug===delivery.slug));
  const article=s.article(),metadata=await article.generateMetadata({params:Promise.resolve({slug:delivery.slug})});assert.equal(metadata.title,delivery.title);assert.equal(metadata.alternates.canonical,delivery.canonicalUrl);
  const html=renderToStaticMarkup(await article.default({params:Promise.resolve({slug:delivery.slug})}));assert(html.includes(delivery.blocks[1].t));assert(html.includes(delivery.title));assert.deepEqual(contract.readPublicBlogMarker(html),delivery);
  const otherSite=site([delivery],other);await assert.rejects(otherSite.article().default({params:Promise.resolve({slug:delivery.slug})}),/ORIGINAL_NOT_FOUND/);
  const index=renderToStaticMarkup(s.index().default());assert(index.includes(delivery.title));assert(index.includes((lang==='en'?'/en':'')+'/blog/'+delivery.slug));
  const otherIndex=renderToStaticMarkup(otherSite.index().default());assert(!otherIndex.includes(delivery.title));assert(!otherIndex.includes(delivery.slug));
  const links=s.sitemap().default().filter(p=>p.url.endsWith('/blog/'+delivery.slug));assert.deepEqual(links.map(p=>p.url),[delivery.canonicalUrl]);
  const feed=await s.rss().GET(),xml=await feed.text();assert.equal(xml.includes(delivery.slug),lang==='en');
 });
 await test('second approved language joins its article without replacing the first',()=>{const es=value(),en=value('en','b');en.publishedAt='2026-10-27';const d=site([es,en]).data(),p=d.getPost(es.slug,'es');assert.deepEqual(p.languages,['es','en']);assert.equal(p.title.es,es.title);assert.equal(p.title.en,en.title);assert.equal(p.date.es,es.publishedAt);assert.equal(p.date.en,en.publishedAt);assert.deepEqual(d.ARTICLE_BODIES[es.slug],{es:es.blocks,en:en.blocks});});
 await test('source delivery cannot overwrite any existing compiled article',()=>{const existing=site().data().BLOG_POSTS[0].slug,v=value();v.slug=existing;v.canonicalUrl='https://ytubviral.com/blog/'+existing;assert.throws(()=>site([v]).data(),/collides/);});
 await test('public marker and SEO scripts escape closing tags while actual body stays text',async()=>{const v=value();v.title='Original </script><script id="bad">injection</script>';v.blocks[1].t='Text <b>must stay text</b>';const s=site([v]),html=renderToStaticMarkup(await s.article().default({params:Promise.resolve({slug:v.slug})}));assert(!html.includes('<script id="bad">'));assert(html.includes('&lt;b&gt;must stay text&lt;/b&gt;'));assert.deepEqual(contract.readPublicBlogMarker(html),v);assert(!renderToStaticMarkup(s.index().default()).includes('<script id="bad">'));});
 await test('one exact native-observable marker is required; duplicate or changed data is denied',()=>{const v=value(),marker='<script id="ytv-blog-publication" type="application/json">'+contract.serializePublicBlogDelivery(v)+'</script>';assert.deepEqual(contract.readPublicBlogMarker(marker),v);assert.throws(()=>contract.readPublicBlogMarker(marker+marker));assert.throws(()=>contract.readPublicBlogMarker('<html>only a build acknowledgement</html>'));assert.throws(()=>contract.readPublicBlogMarker(marker.replace('"es"','"en"')));});
 console.log(JSON.stringify({scope:'Public compiled blog contract and actual TypeScript catalog, article, index, RSS and sitemap rendered with native React DOM; no application startup or external calls',results},null,2));if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;});
