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
}
async function putFile(name,buffer,contentType){
  if(process.env.BYJH_LOCAL_STATE)return 'data:'+contentType+';base64,'+buffer.toString('base64');
  const {put}=require('@vercel/blob');
  const r=await put('byjh/uploads/'+name,buffer,{access:'public',addRandomSuffix:true,contentType});
  return r.url;
}
// Empty marker blobs for sign-in rate limits. mark() is atomic: it returns false when the name is already taken.
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
module.exports={load,save,putFile,mark,marks,unmark};
