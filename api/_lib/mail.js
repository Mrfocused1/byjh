// Sends email through Resend (byjh.co.uk is a verified sending domain). Env: RESEND_API_KEY.
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

async function sendEmail({from,to,subject,text,html,replyTo,key}){
  if(!process.env.RESEND_API_KEY)throw fail('Email sending is not set up yet. Please contact your web team.',503);
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},
    body:JSON.stringify({from,to,subject,text,html,...(replyTo?{reply_to:replyTo}:{})}),
  });
  if(!response.ok){
    console.error('Resend error',response.status,await response.text().catch(()=>''));
    throw fail('We couldn’t send the email just now. Please try again in a minute.',502);
  }
}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

module.exports={sendEmail,escapeHtml};
