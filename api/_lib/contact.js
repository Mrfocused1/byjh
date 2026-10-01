// Contact-page enquiries, emailed to the BYJH team through Resend with reply-to set to the visitor.
// Env: optional CONTACT_TO (comma-separated) and CONTACT_FROM.
const crypto=require('crypto');
const store=require('./store');
const {sendEmail,escapeHtml}=require('./mail');

const TO=(process.env.CONTACT_TO||'info@byjh.co.uk,remmie@byjh.co.uk').split(',').map(e=>e.trim()).filter(Boolean);
const FROM=process.env.CONTACT_FROM||'BYJH Website <website@byjh.co.uk>';
const DAILY_ENQUIRIES=50;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});

async function sendEnquiry(req,data){
  const line=(v,max)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
  const name=line(data.name,120),email=line(data.email,254),topic=line(data.topic,120)||'General enquiry';
  const summary=String(data.summary??'').replace(/\r\n?/g,'\n').trim();
  if(!name||!summary)throw fail('Please fill in your name and message.');
  if(summary.length>8000)throw fail('Your message is too long. Please shorten it and try again.');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw fail('Please enter a valid email address.');
  // One enquiry a minute from each visitor and DAILY_ENQUIRIES a day overall, so a flood can't swamp the inbox.
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
  const visitor=crypto.createHash('sha256').update(ip).digest('hex').slice(0,16);
  if((await store.liveMarks('contact/')).length>=DAILY_ENQUIRIES)throw fail('We’ve had a lot of enquiries today. Please email info@byjh.co.uk directly.',429);
  if(!await store.mark(`contact/${store.dayAfterThisMinute()}-${visitor}`))throw fail('You’ve just sent an enquiry. Please wait a minute before sending another.',429);
  const footer=`Sent from the contact form on byjh.co.uk. Reply to this email to answer ${name} directly.`;
  await sendEmail({
    from:FROM,to:TO,replyTo:email,
    subject:`Website enquiry: ${topic} from ${name}`,
    text:`${summary}\n\n—\n${footer}`,
    html:`<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;padding:24px"><p style="font-size:12px;letter-spacing:.2em;color:#666;margin:0 0 20px">BYJH · WEBSITE ENQUIRY</p><div style="font-size:15px;line-height:1.6;white-space:pre-wrap">${escapeHtml(summary)}</div><p style="font-size:12px;color:#777;border-top:1px solid #ddd;padding-top:12px;margin-top:24px">${escapeHtml(footer)}</p></div>`,
  });
  return {ok:true};
}

module.exports={sendEnquiry};
