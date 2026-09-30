// Shared admin state (drafts, published copy, media swaps, uploads) kept as one JSON file in Vercel Blob.
// For local testing set BYJH_LOCAL_STATE=/path/state.json instead of a Blob token.
const fs=require('fs');
const KEY='byjh/state.json';
const ACCESS=process.env.BYJH_BLOB_ACCESS||'public';
const empty=()=>({content:{},media:{},uploads:[]});

async function load(){
  if(process.env.BYJH_LOCAL_STATE){
    try{return {...empty(),...JSON.parse(fs.readFileSync(process.env.BYJH_LOCAL_STATE,'utf8'))};}catch{return empty();}
  }
  if(!process.env.BLOB_READ_WRITE_TOKEN)throw new Error('Storage is not connected. Add a Vercel Blob store to this project (Storage tab) and redeploy.');
  const {get}=require('@vercel/blob');
  // useCache:false reads origin storage; the CDN otherwise serves a stale copy for a while after a save.
  const result=await get(KEY,{access:ACCESS,useCache:false});
  if(!result)return empty();
  return {...empty(),...JSON.parse(await new Response(result.stream).text())};
}
async function save(state){
  if(process.env.BYJH_LOCAL_STATE){fs.writeFileSync(process.env.BYJH_LOCAL_STATE,JSON.stringify(state));return;}
  const {put}=require('@vercel/blob');
  await put(KEY,JSON.stringify(state),{access:ACCESS,addRandomSuffix:false,allowOverwrite:true,contentType:'application/json',cacheControlMaxAge:0});
}
async function putFile(name,buffer,contentType){
  if(process.env.BYJH_LOCAL_STATE)return 'data:'+contentType+';base64,'+buffer.toString('base64');
  const {put}=require('@vercel/blob');
  const r=await put('byjh/uploads/'+name,buffer,{access:'public',addRandomSuffix:true,contentType});
  return r.url;
}
module.exports={load,save,putFile};
