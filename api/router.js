// Vercel function serving (1) the public pages with admin edits applied and (2) the /api/* admin endpoints.
// TEMPORARY TEST MODE: there is no login. Anyone who opens /admin can edit the site.
// To restore access control, set AUTH_DISABLED=false and implement a real session() below.
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {ContentPage,InterfaceCopy,escapeHtml}=require('./_lib/cms');
const store=require('./_lib/store');
const assets=require('./_lib/assets.json');

const AUTH_DISABLED=true;
const DIST=path.join(__dirname,'..','dist');
const COPY_PAGES={
  'interface':['Forms & access','site-copy.json'],
  'copy-shared':['Navigation & controls','copy/shared.json'],
  'copy-admin':['Admin workspace','copy/admin.json'],
  'copy-account':['Member & partner accounts','copy/account.json'],
  'copy-public':['Public interactions','copy/public.json'],
  'copy-system':['System messages','copy/system.json'],
};
const PAGES={
  home:['Home','index.html','/'],
  members:['Members','members/index.html','/members/'],
  partners:['Partners','partners/index.html','/partners/'],
  gallery:['Gallery','gallery/index.html','/gallery/'],
  contact:['Contact','contact/index.html','/contact/'],
  'interface':['Forms & access','site-copy.json','/apply/'],
  'copy-shared':['Navigation & controls','copy/shared.json','/admin/'],
  'copy-admin':['Admin workspace','copy/admin.json','/admin/'],
  'copy-account':['Member & partner accounts','copy/account.json','/account/?role=member'],
  'copy-public':['Public interactions','copy/public.json','/contact/'],
  'copy-system':['System messages','copy/system.json','/admin/'],
};
const read=file=>fs.readFileSync(path.join(DIST,file),'utf8');
const SCHEMAS=Object.fromEntries(Object.entries(COPY_PAGES).map(([k,[,file]])=>[k,JSON.parse(read(file))]));
const DEFAULTS={};for(const s of Object.values(SCHEMAS))for(const [k,v] of Object.entries(s))DEFAULTS[k]=v.value;
const TOKEN=/\{([A-Za-z_]\w*)\}/g;
const now=()=>new Date().toISOString().replace(/\.\d+Z$/,'+00:00');
const parse=(page,values)=>page in COPY_PAGES?new InterfaceCopy(read(PAGES[page][1]),values):new ContentPage(read(PAGES[page][1]),values);
const entry=(state,page)=>state.content[page]||(state.content[page]={draft:{},published:{},revision:0,updated:null});

function copyValues(state,preview){
  const result={...DEFAULTS};
  for(const [page,row] of Object.entries(state.content)){
    if(!(page in COPY_PAGES))continue;
    for(const [k,v] of Object.entries(row[preview?'draft':'published']||{}))if(k in SCHEMAS[page]&&typeof v==='string')result[k]=v;
  }
  return result;
}
const copyText=(copy,key,fallback)=>(copy[key]??DEFAULTS[key]??fallback??key);
function replaceMedia(source,state){
  const keys=Object.keys(state.media).sort((a,b)=>b.length-a.length);
  if(!keys.length)return source;
  return source.replace(new RegExp(keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g'),m=>state.media[m].target);
}
function injectCopy(markup,copy,preview,isStatic){
  if(isStatic){
    const titles={'Private office — BYJH':'admin','Member access — BYJH':'memberLogin','Partner access — BYJH':'partnerLogin','Your account — BYJH':'account','Your introduction — BYJH':'apply','Admin access — BYJH':'adminLogin','Account access — BYJH':'login'};
    for(const [orig,key] of Object.entries(titles))markup=markup.replace('<title>'+orig+'</title>',()=>'<title>'+escapeHtml(copyText(copy,'document.'+key))+'</title>');
    markup=markup.replace('Opening BYJH…',()=>escapeHtml(copyText(copy,'loading.open')));
  }
  const config=JSON.stringify(copy).replace(/</g,'\\u003c');
  const extra='<script>window.BYJH_COPY='+config+';</script><script>window.BYJH_COPY_PREVIEW='+(preview?'true':'false')+';</script><script src="/copy.js"></script>';
  return markup.replace('</head>',()=>extra+'</head>');
}

const ADMIN_USER={id:'admin',email:'admin@byjh.local',role:'admin',name:'BYJH Admin',phone:'',company:'',sector:'',website:'',message:'',status:'active',notes:'',created:'2026-01-01T00:00:00+00:00'};
const emptyAnalytics=days=>({days,views:0,applications:0,daily:[],pages:[],devices:[],sources:[]});

function send(res,status,body,type='application/json; charset=utf-8'){
  res.statusCode=status;res.setHeader('Content-Type',type);res.setHeader('Cache-Control','no-store');
  res.end(typeof body==='string'?body:JSON.stringify(body));
}
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

async function api(req,res,route,query){
  const post=req.method==='POST';
  const data=post?(typeof req.body==='string'?JSON.parse(req.body||'{}'):req.body||{}):{};
  const preview=query.preview==='1'||req.headers['x-byjh-preview']==='1';
  if(route==='session')return send(res,200,{user:AUTH_DISABLED?ADMIN_USER:null,needsSetup:false});
  if(!AUTH_DISABLED)return send(res,401,{error:'Please sign in to continue.'});
  if(route==='track'||route==='logout')return send(res,200,{ok:true});
  if(route==='account'&&!post){
    const role=['member','partner'].includes(query.role)?query.role:'member';
    const status=['pending','active','declined','suspended'].includes(query.status)?query.status:'pending';
    return send(res,200,{preview:true,user:{id:'preview',name:role==='member'?'Member preview':'Partner preview',email:'preview@example.invalid',role,status,company:'',phone:'',website:'',sector:'',created:now()},requests:[]});
  }
  if(['account','password','admin/person','admin/request','requests','login','setup','apply'].includes(route))
    throw fail('Not available in test mode.',501);
  const state=await store.load();
  if(route==='debug-state'){const {list}=require('@vercel/blob');const l=await list({prefix:'byjh/'});return send(res,200,{blobs:l.blobs.map(b=>[b.pathname,b.url,b.uploadedAt]),rev:Object.fromEntries(Object.entries(state.content).map(([k,r])=>[k,r.revision]))});}
  if(route==='admin/overview')return send(res,200,{counts:{member:0,partner:0,pending:0,requests:0},recent:[],activity:[],analytics:emptyAnalytics(30)});
  if(route==='admin/people')return send(res,200,{people:[]});
  if(route==='admin/requests')return send(res,200,{requests:[]});
  if(route==='admin/analytics')return send(res,200,emptyAnalytics(Math.min(90,Math.max(1,parseInt(query.days||'30',10)||30))));
  const mediaList=()=>{
    const list=assets.map(a=>({...a,current:state.media[a.url]?state.media[a.url].target:a.url,replaced:!!state.media[a.url]}));
    for(const u of [...state.uploads].reverse())list.push({...u,current:u.url,replaced:false});
    return list;
  };
  if(route==='admin/media'&&!post)return send(res,200,{media:mediaList()});
  if(route==='admin/content'&&!post){
    const copy=copyValues(state,true);
    const pages=Object.entries(PAGES).map(([key,[label,,url]])=>{
      const row=entry(state,key),parsed=parse(key,row.draft);
      return {id:key,title:copyText(copy,'page.'+key,label),url,revision:row.revision,updated:row.updated,dirty:JSON.stringify(row.draft)!==JSON.stringify(row.published),fields:parsed.fields,copyGroup:key in COPY_PAGES};
    });
    return send(res,200,{pages});
  }
  if(['admin/content','admin/publish','admin/discard'].includes(route)){
    const page=data.page;
    if(!(page in PAGES))throw fail('Invalid page.');
    const row=entry(state,page);
    if(data.revision!==row.revision)throw fail('This page changed in another session. Reload before saving.',409);
    if(route==='admin/content'){
      const fields=data.fields;
      if(!fields||typeof fields!=='object'||Array.isArray(fields))throw fail('Invalid content.');
      const allowed=Object.fromEntries(parse(page).fields.map(f=>[f.id,f]));
      for(const [key,value] of Object.entries(fields)){
        if(!(key in allowed)||typeof value!=='string'||value.length>10000)throw fail('Invalid content field.');
        if(page in COPY_PAGES){
          const names=t=>[...new Set([...t.matchAll(TOKEN)].map(m=>m[1]))].sort().join();
          if(names(allowed[key].original)!==names(value)||/[{}]/.test(value.replace(TOKEN,'')))throw fail('Keep the original placeholders in this wording.');
        }
        if(allowed[key].type==='number'&&!(/^\d+$/.test(value)&&+value>=1&&+value<=100))throw fail('Seat count must be between 1 and 100.');
      }
      try{parse(page,fields).rendered;}catch(e){throw fail(e.message);}
      row.draft=fields;
    }else if(route==='admin/publish')row.published=row.draft;
    else row.draft=row.published;
    row.revision++;row.updated=now();
    await store.save(state);
    return send(res,200,{ok:true,revision:row.revision});
  }
  if(route==='admin/upload'){
    const name=path.basename(String(data.name||'')).slice(0,200);
    if(!name)throw fail('Invalid name.');
    const ext=path.extname(name).toLowerCase();
    let raw;try{raw=Buffer.from(String(data.data||''),'base64');}catch{throw fail('Invalid file.');}
    if(!raw.length)throw fail('Invalid file.');
    if(raw.length>3*1024*1024)throw fail('On this hosting, uploads are limited to 3 MB. Use a smaller file.');
    const magic={'.jpg':raw.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])),'.jpeg':raw.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])),'.png':raw.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'.gif':/^GIF8[79]a/.test(raw.subarray(0,6).toString('latin1')),'.webp':raw.subarray(0,4).toString('latin1')==='RIFF'&&raw.subarray(8,12).toString('latin1')==='WEBP','.mp4':raw.subarray(4,8).toString('latin1')==='ftyp','.webm':raw.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))};
    if(!magic[ext])throw fail('Upload a valid JPG, PNG, GIF, WebP, MP4 or WebM file.');
    const types={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.webm':'video/webm'};
    const url=await store.putFile(crypto.randomBytes(8).toString('hex')+ext,raw,types[ext]);
    state.uploads.push({url,name,size:raw.length,created:now(),type:['.mp4','.webm'].includes(ext)?'video':'image'});
    await store.save(state);
    return send(res,201,{url});
  }
  if(route==='admin/media'&&post){
    const {source,target}=data;const items=Object.fromEntries(mediaList().map(m=>[m.url,m]));
    if(!(source in items)||!String(source).startsWith('/assets/')||!(target in items))throw fail('Choose an existing site asset and a library file.');
    if(items[source].type!==items[target].type)throw fail('Replace an image with an image, or a video with a video.');
    const ext=p=>path.extname(p).toLowerCase();
    if(source!==target&&['.webm','.mp4'].includes(ext(source))&&ext(source)!==ext(target))throw fail('Use the same video format to preserve playback support.');
    if(target!==source&&Object.prototype.hasOwnProperty.call(state.media,target))throw fail('Choose an original or uploaded file, not another replaced asset.');
    if(target!==source&&Object.values(state.media).some(m=>m.target===source))throw fail('This original is used by another replacement. Restore that replacement first, or upload a separate file.');
    if(target===source)delete state.media[source];
    else state.media[source]={target,updated:now()};
    await store.save(state);
    return send(res,200,{ok:true});
  }
  throw fail('Not found.',404);
}

const STATIC_PAGES={
  admin:'admin/index.html','admin-login':'admin/index.html',account:'account/index.html',apply:'apply/index.html',login:'login/index.html',
  'members-login':'members/login/index.html','partners-login':'partners/login/index.html',
};
async function page(req,res,name,query){
  const state=await store.load();
  const preview=query.preview==='1';
  const copy=copyValues(state,preview);
  let markup,isStatic=false;
  if(name in PAGES&&!(name in COPY_PAGES)){
    const row=entry(state,name);
    markup=parse(name,row[preview?'draft':'published']).rendered;
  }else if(STATIC_PAGES[name]){markup=read(STATIC_PAGES[name]);isStatic=true;}
  else return send(res,404,'Not found','text/plain');
  markup=injectCopy(replaceMedia(markup,state),copy,preview,isStatic);
  send(res,200,markup,'text/html; charset=utf-8');
}

module.exports=async(req,res)=>{
  const url=new URL(req.url,'http://x');const query=Object.fromEntries(url.searchParams);
  try{
    if(query.page)return await page(req,res,query.page,query);
    return await api(req,res,String(query.route||'').replace(/^\/+|\/+$/g,''),query);
  }catch(e){
    const status=e.status||500;
    send(res,status,{error:status===500?(e.message||'Something went wrong. Please try again.'):e.message});
  }
};
