// Shared admin state (drafts, published copy, media swaps, uploads) kept as one JSON file in Vercel Blob.
// For local testing set BYJH_LOCAL_STATE=/path/state.json instead of a Blob token.
const fs=require('fs');
const PREFIX='byjh/state/';
const ACCESS=process.env.BYJH_BLOB_ACCESS||'public';
const empty=()=>({content:{},media:{},uploads:[]});

async function load(){
  if(process.env.BYJH_LOCAL_STATE){
    try{return {...empty(),...JSON.parse(fs.readFileSync(process.env.BYJH_LOCAL_STATE,'utf8'))};}catch{return empty();}
  }
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Storage is not connected. Add a Vercel Blob store to this project (Storage tab) and redeploy.');
  // Every save is a new immutable blob, found through list() (uncached); overwriting one URL leaves stale CDN copies.
  const {list}=require('@vercel/blob');
  const {blobs}=await list({prefix:PREFIX});
  if(!blobs.length)return empty();
  const latest=blobs.reduce((a,b)=>a.pathname>b.pathname?a:b);
  const res=await fetch(latest.url);
  if(!res.ok)throw new Error('Unable to read saved content.');
  return {...empty(),...(await res.json())};
}
async function save(state){
  if(process.env.BYJH_LOCAL_STATE){fs.writeFileSync(process.env.BYJH_LOCAL_STATE,JSON.stringify(state));return;}
  const {put,list,del}=require('@vercel/blob');
  const before=(await list({prefix:PREFIX})).blobs;
  await put(PREFIX+String(Date.now()).padStart(15,'0')+'.json',JSON.stringify(state),{access:ACCESS,addRandomSuffix:false,contentType:'application/json'});
  if(before.length)await del(before.map(b=>b.url)).catch(()=>{});
  await writeSnapshot(state).catch(()=>{});
}
// Public pages read a published-only snapshot at a fixed URL instead of calling list(): CDN hits are free, while list()
// is a metered "advanced operation" (2,000 a month on the Hobby plan, then storage is blocked). It may lag a save by a minute.
const SNAPSHOT='byjh/public.json';
function snapshotURL(){
  const id=String(process.env.BLOB_READ_WRITE_TOKEN||'').split('_')[3];
  return id?`https://${id.toLowerCase()}.public.blob.vercel-storage.com/${SNAPSHOT}`:null;
}
async function writeSnapshot(state){
  const {put}=require('@vercel/blob');
  const content=Object.fromEntries(Object.entries(state.content).map(([page,row])=>[page,{published:row.published||{}}]));
  await put(SNAPSHOT,JSON.stringify({content,media:state.media,uploads:[]}),{access:'public',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:60});
}
async function loadPublic(){
  if(process.env.BYJH_LOCAL_STATE)return load();
  const url=snapshotURL();
  const res=url&&await fetch(url).catch(()=>null);
  if(res&&res.ok)return {...empty(),...(await res.json())};
  const state=await load();
  await writeSnapshot(state).catch(()=>{});
  return state;
}
async function putFile(name,buffer,contentType){
  if(process.env.BYJH_LOCAL_STATE)return 'data:'+contentType+';base64,'+buffer.toString('base64');
  const {put}=require('@vercel/blob');
  const r=await put('byjh/uploads/'+name,buffer,{access:'public',addRandomSuffix:true,contentType});
  return r.url;
}
// Empty marker blobs for rate limits, named "<kind>/<expiry in unix seconds>…". mark() is atomic: it returns false when the name is already taken.
const AUTH='byjh/auth/';
const localMarks=new Map();
async function mark(name){
  if(process.env.BYJH_LOCAL_STATE){if(localMarks.has(name))return false;localMarks.set(name,name);return true;}
  const {put}=require('@vercel/blob');
  try{await put(AUTH+name,'1',{access:ACCESS,addRandomSuffix:false,allowOverwrite:false,contentType:'text/plain'});return true;}
  catch(e){if(/already exists/i.test(e.message))return false;throw e;}
}
async function marks(){
  if(process.env.BYJH_LOCAL_STATE)return [...localMarks.keys()].map(name=>({name,url:name}));
  const {list}=require('@vercel/blob');
  const out=[];let cursor;
  do{const r=await list({prefix:AUTH,cursor});out.push(...r.blobs.map(b=>({name:b.pathname.slice(AUTH.length),url:b.url})));cursor=r.hasMore?r.cursor:null;}while(cursor);
  return out;
}
async function unmark(items){
  if(process.env.BYJH_LOCAL_STATE){items.forEach(m=>localMarks.delete(m.name));return;}
  const {del}=require('@vercel/blob');
  await del(items.map(m=>m.url));
}
// Unexpired markers under a prefix; expired ones are deleted along the way.
async function liveMarks(prefix){
  const all=await marks(),now=Date.now()/1000;
  const old=all.filter(m=>+m.name.split(/[/-]/)[1]<now);
  if(old.length)await unmark(old).catch(()=>{});
  return all.filter(m=>m.name.startsWith(prefix)&&!old.includes(m));
}
// Expiry stamp shared by every request in the current minute, one day ahead: a per-minute marker name that also says when to delete it.
const dayAfterThisMinute=()=>(Math.floor(Date.now()/60000)+1440)*60;
module.exports={load,loadPublic,save,putFile,mark,marks,unmark,liveMarks,dayAfterThisMinute};
