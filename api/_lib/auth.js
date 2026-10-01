// Email-code sign-in for /admin: a 6-digit code is emailed through Resend, then a signed cookie keeps the session until sign-out.
// Env: RESEND_API_KEY, AUTH_SECRET (32+ random chars), optional ADMIN_EMAILS (comma-separated) and MAIL_FROM.
const crypto=require('crypto');
const store=require('./store');

const ADMINS=(process.env.ADMIN_EMAILS||'cozeebyjh@gmail.com').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean);
const FROM=process.env.MAIL_FROM||'BYJH <login@byjh.co.uk>';
const CODE_MINUTES=10,SESSION_DAYS=365,MAX_TRIES=5,DAILY_CODES=10;
const SESSION='byjh_session',CHALLENGE='byjh_challenge';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

function secret(){
  const s=process.env.AUTH_SECRET;
  if(!s||s.length<32)throw fail('Sign-in is not set up yet. Please contact your web team.',503);
  return s;
}
const mac=data=>crypto.createHmac('sha256',secret()).update(data).digest('base64url');
const same=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const sign=obj=>{const body=Buffer.from(JSON.stringify(obj)).toString('base64url');return body+'.'+mac(body);};
function unsign(token,type){
  if(typeof token!=='string')return null;
  const [body,sig]=token.split('.');
  if(!body||!sig||!same(sig,mac(body)))return null;
  try{const obj=JSON.parse(Buffer.from(body,'base64url').toString());return obj.t===type&&obj.x>Date.now()/1000?obj:null;}catch{return null;}
}

function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(/;\s*/)){const i=part.indexOf('=');if(i>0)out[part.slice(0,i)]=part.slice(i+1);}
  return out;
}
function setCookie(req,res,name,value,maxAge,path){
  const local=/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'');
  const line=`${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${local?'':'; Secure'}`;
  const prev=res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie',[...(prev?[].concat(prev):[]),line]);
}

// The signed-in admin's email, or null.
function user(req){
  if(!process.env.AUTH_SECRET)return null;
  const s=unsign(cookies(req)[SESSION],'s');
  return s&&ADMINS.includes(s.e)?s.e:null;
}

async function sendCode(req,res,raw){
  const email=String(raw||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw fail('Enter a valid email address.');
  if(!ADMINS.includes(email))throw fail('This email address doesn’t have access to the admin.',403);
  if(!process.env.RESEND_API_KEY)throw fail('Email sending is not set up yet. Please contact your web team.',503);
  secret();
  // At most one code per minute (an atomic marker per minute) and DAILY_CODES per day; markers older than a day are tidied up.
  const minute=Math.floor(Date.now()/60000);
  const marks=await store.marks(),stamp=m=>+m.name.split(/[/-]/)[1];
  const old=marks.filter(m=>m.name.startsWith('sent/')?stamp(m)<minute-1440:stamp(m)<Date.now()/1000);
  if(old.length)await store.unmark(old).catch(()=>{});
  if(marks.filter(m=>m.name.startsWith('sent/')&&!old.includes(m)).length>=DAILY_CODES)throw fail('Too many codes requested today. Please try again tomorrow.',429);
  if(!await store.mark('sent/'+minute))throw fail('A code was just sent. Please wait a minute before asking for another.',429);

  const code=String(crypto.randomInt(0,1e6)).padStart(6,'0');
  const nonce=crypto.randomBytes(12).toString('base64url');
  const x=Math.floor(Date.now()/1000)+CODE_MINUTES*60;
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'byjh-login-'+nonce},
    body:JSON.stringify({
      from:FROM,to:[email],
      subject:`${code} is your BYJH sign-in code`,
      text:`Your BYJH admin sign-in code is ${code}\n\nIt expires in ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email.`,
      html:`<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:420px;margin:0 auto;padding:32px 24px"><p style="font-size:12px;letter-spacing:.2em;color:#666;margin:0 0 24px">BYJH · PRIVATE OFFICE</p><p style="font-size:16px;margin:0 0 16px">Your sign-in code is</p><p style="font-size:36px;font-weight:bold;letter-spacing:.3em;margin:0 0 24px">${code}</p><p style="font-size:14px;color:#555;margin:0">It expires in ${CODE_MINUTES} minutes. If you didn’t ask for it, you can ignore this email.</p></div>`,
    }),
  });
  if(!response.ok){
    console.error('Resend error',response.status,await response.text().catch(()=>''));
    throw fail('We couldn’t send the email just now. Please try again in a minute.',502);
  }
  setCookie(req,res,CHALLENGE,sign({t:'c',e:email,n:nonce,x,h:mac('code:'+nonce+':'+code)}),CODE_MINUTES*60,'/api/login');
  return {ok:true,email};
}

async function verifyCode(req,res,raw){
  const c=unsign(cookies(req)[CHALLENGE],'c');
  if(!c||!ADMINS.includes(c.e))throw fail('This code has expired. Please ask for a new one.');
  const code=String(raw||'').replace(/\D/g,'');
  if(code.length!==6)throw fail('Enter the 6-digit code from the email.');
  // Each guess claims one of MAX_TRIES markers for this code; creation is atomic, so parallel guesses can't share a slot.
  let tries=0;
  while(tries<MAX_TRIES&&!await store.mark(`tries/${c.x}-${c.n}/${tries+1}`))tries++;
  if(tries>=MAX_TRIES){
    setCookie(req,res,CHALLENGE,'',0,'/api/login');
    throw fail('Too many attempts. Please ask for a new code.',429);
  }
  if(!same(mac('code:'+c.n+':'+code),c.h)){
    const left=MAX_TRIES-tries-1;
    throw fail(left?`That code isn’t right. ${left} ${left===1?'try':'tries'} left.`:'That code isn’t right. Please ask for a new code.');
  }
  setCookie(req,res,CHALLENGE,'',0,'/api/login');
  setCookie(req,res,SESSION,sign({t:'s',e:c.e,x:Math.floor(Date.now()/1000)+SESSION_DAYS*86400}),SESSION_DAYS*86400,'/');
  return {ok:true};
}

function logout(req,res){setCookie(req,res,SESSION,'',0,'/');return {ok:true};}

module.exports={user,sendCode,verifyCode,logout};
