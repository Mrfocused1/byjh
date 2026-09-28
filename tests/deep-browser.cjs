// Focused adverse-condition and accessibility regressions. Never uses live data.
const { chromium }=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'byjh-gap-')),base='http://127.0.0.1:8190';
const child=spawn(process.env.PYTHON||'/opt/homebrew/bin/python3',['server.py','--port','8190'],{cwd:root,env:{...process.env,BYJH_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
let browser;const results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 await new Promise((ok,fail)=>{child.stdout.once('data',ok);child.once('error',fail);child.stderr.once('data',d=>fail(new Error(String(d))));});
 browser=await chromium.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const ctx=await browser.newContext({viewport:{width:1440,height:950}}),page=await ctx.newPage();
 const post=(api,body)=>ctx.request.post(base+'/api/'+api,{data:body,headers:{'X-BYJH':'1'}});
 await post('setup',{name:'Audit Owner',email:'audit@example.invalid',password:'audit-owner-password'});
 for(const role of ['member','partner']){const c=await browser.newContext();await c.request.post(base+'/api/apply',{headers:{'X-BYJH':'1'},data:{name:'QA '+role,role,company:'QA Company',email:role+'@example.invalid',password:'audit-password-123',consent:true}});await c.close();}
 async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS '+name);}catch(e){results.push({name,pass:false,error:e.message});console.log('FAIL '+name+': '+e.message.split('\n')[0]);}finally{await page.unrouteAll({behavior:'ignoreErrors'});page.removeAllListeners('dialog');}}
 await test('CMS preserves typing after a save has started',async()=>{
  await page.goto(base+'/admin/#content');const input=page.locator('#content-form textarea').first();await input.fill('First saved value');
  let release;const gate=new Promise(r=>release=r);let arrived;const waiting=new Promise(r=>arrived=r);
  await page.route('**/api/admin/content',async route=>{if(route.request().method()==='POST'){arrived();await gate;}await route.continue();});
  await page.getByRole('button',{name:'Save draft'}).click();await waiting;
  const locked=await input.isDisabled();if(!locked)await input.fill('Newer unsaved value');release();await page.getByRole('button',{name:'Save draft'}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('#content-form button[type=submit]').disabled);
  if(!locked){assert.equal(await input.inputValue(),'Newer unsaved value');assert.equal(await page.locator('#publish').isDisabled(),true,'Publish must not discard newer unsaved edits');}
 });
 await test('Slow member response cannot overwrite partner records',async()=>{
  await page.goto(base+'/admin/');await page.getByRole('heading',{name:'Your world.'}).waitFor();let release;const gate=new Promise(r=>release=r);let first=true,arrived;const waiting=new Promise(r=>arrived=r);
  await page.route('**/api/admin/people',async route=>{if(first){first=false;arrived();await gate;}await route.continue();});
  await page.getByRole('link',{name:'Members',exact:true}).click();await waiting;await page.getByRole('link',{name:'Partners',exact:true}).click();await page.getByRole('button',{name:'Manage QA partner'}).waitFor();release();await delay(250);
  assert.equal(await page.getByRole('button',{name:'Manage QA partner'}).count(),1);assert.equal(await page.getByRole('button',{name:'Manage QA member'}).count(),0);
 });
 await test('Late CRM saves cannot erase edits on a different page',async()=>{
  await page.setViewportSize({width:1440,height:950});await page.goto(base+'/admin/#members');await page.getByRole('button',{name:'Manage QA member'}).click();
  let release,arrived;const gate=new Promise(r=>release=r),waiting=new Promise(r=>arrived=r);
  await page.route('**/api/admin/person',async route=>{arrived();await gate;await route.continue();});
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await waiting;await page.getByRole('button',{name:'Close panel'}).click();await page.getByRole('link',{name:'Website content',exact:true}).click();
  const input=page.locator('#content-form textarea').first();await input.fill('Keep this unsaved page edit');release();await page.getByText('Account updated',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Keep this unsaved page edit');
  page.on('dialog',d=>d.accept());await page.goto(base+'/admin/');
 });
 await test('Discard locks editing until the published content has reloaded',async()=>{
  await page.goto(base+'/admin/#content');await page.locator('#content-form textarea').first().fill('Discard this');page.on('dialog',d=>d.accept());
  let release,arrived;const gate=new Promise(r=>release=r),waiting=new Promise(r=>arrived=r);
  await page.route('**/api/admin/discard',async route=>{arrived();await gate;await route.continue();});await page.getByRole('button',{name:'Discard draft'}).click();await waiting;
  assert(await page.locator('#content-form textarea').first().isDisabled());assert(await page.locator('[data-page="members"]').isDisabled());release();await page.getByText('Draft discarded',{exact:true}).waitFor();assert(!(await page.locator('#content-form textarea').first().isDisabled()));
 });
 await test('Profile saves preserve an unfinished password change',async()=>{
  const partner=await browser.newContext(),p=await partner.newPage();await partner.request.post(base+'/api/login',{headers:{'X-BYJH':'1'},data:{email:'partner@example.invalid',password:'audit-password-123',role:'partner'}});
  await p.goto(base+'/account/#settings');await p.getByLabel('New password',{exact:true}).fill('unsaved-new-password');await p.getByLabel('Company name',{exact:true}).fill('Saved Company');await p.getByRole('button',{name:'Save details'}).click();await p.getByText('Your details are saved',{exact:true}).waitFor();await delay(100);assert.equal(await p.getByLabel('New password',{exact:true}).inputValue(),'unsaved-new-password');
  await partner.clearCookies();await p.reload();await p.waitForURL('**/partners/login/');await partner.close();
 });
 await test('Upload media has a keyboard-operable button',async()=>{await page.goto(base+'/admin/#media');await page.getByRole('heading',{name:'Media library.'}).waitFor();const button=page.getByRole('button',{name:'Upload media',exact:true});assert.equal(await button.count(),1);await button.focus();assert.equal(await button.evaluate(el=>el===document.activeElement),true);});
 await test('Mobile navigation contains focus and closes on its current link',async()=>{
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/admin/');await page.getByRole('heading',{name:'Your world.'}).waitFor();await page.getByRole('button',{name:'Toggle sidebar'}).click();
  for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.querySelector('#sidebar').contains(document.activeElement)),true,'Focus escaped into obscured page content');}
  await page.getByRole('link',{name:'Overview',exact:true}).click();assert.equal(await page.locator('#sidebar').isVisible(),false);
 });
 await test('Application button exists on index.html aliases',async()=>{await page.goto(base+'/members/index.html?nointro');assert.equal(await page.getByRole('button',{name:'Become a member'}).count(),1);await page.goto(base+'/partners/index.html?nointro');assert.equal(await page.getByRole('button',{name:'Become a partner'}).count(),1);});
 await test('Reopening application preserves unfinished fields',async()=>{await page.goto(base+'/members/?nointro');await page.getByRole('button',{name:'Become a member'}).click();await page.frameLocator('iframe').getByLabel('Full name',{exact:true}).fill('Keep this introduction');await page.getByRole('button',{name:'Close application'}).click();await page.getByRole('button',{name:'Become a member'}).click();assert.equal(await page.frameLocator('iframe').getByLabel('Full name',{exact:true}).inputValue(),'Keep this introduction');});
 await test('Published preview-like URLs still record a visit',async()=>{const anon=await browser.newContext();const p=await anon.newPage();let tracked=false;p.on('request',r=>{if(r.url().endsWith('/api/track'))tracked=true;});await p.goto(base+'/gallery/?preview=0&nointro');await delay(100);assert(tracked);await anon.close();});
 await test('Public looping motion exposes a pause control',async()=>{await page.goto(base+'/?nointro');assert.equal(await page.locator('#hero-play').count(),1);await page.locator('#hero-play').click();await page.goto(base+'/partners/?nointro');assert.equal(await page.locator('[data-motion-toggle]').count(),1);await page.locator('[data-motion-toggle]').click();assert.equal(await page.evaluate(()=>window.BYJH.motion),false);});
 await test('Navigation dialogs have accessible names',async()=>{await page.goto(base+'/?nointro');await page.getByRole('button',{name:'Open navigation'}).click();assert.equal(await page.getByRole('dialog',{name:'Main navigation',exact:true}).count(),1);});
 await test('Shared form copy previews privately and publishes safely',async()=>{
  const catalog=await (await ctx.request.get(base+'/api/admin/content')).json(),entry=catalog.pages.find(p=>p.id==='interface');
  const fields={'member.join':'Join our community','member.apply.description':'A personal introduction.','form.name':'Your full name','form.help':'Account assistance','quote.first':'<script>no code</script>'};
  const save=await (await post('admin/content',{page:'interface',revision:entry.revision,fields})).json();
  await page.goto(base+'/members/?preview=1&nointro');await page.getByRole('button',{name:'Join our community'}).click();await page.frameLocator('iframe').getByLabel('Your full name',{exact:true}).waitFor();await page.getByRole('button',{name:'Close application'}).click();
  const anon=await browser.newContext(),p=await anon.newPage();await p.goto(base+'/members/?preview=1&nointro');assert.equal(await p.getByRole('button',{name:'Become a member'}).count(),1);
  await post('admin/publish',{page:'interface',revision:save.revision});await p.goto(base+'/apply/');await p.getByLabel('Your full name',{exact:true}).waitFor();assert.equal(await p.locator('.sub').innerText(),'A personal introduction.');assert.equal(await p.locator('.auth-quote h2').textContent(),'<script>no code</script>YOUR WORLD.');assert.equal(await p.locator('.auth-quote script').count(),0);
  await p.goto(base+'/members/login/');assert.match(await p.locator('.auth-box').innerText(),/Account assistance/);await anon.close();
 });
 await test('All new routes fit 320px and 768px viewports',async()=>{
  for(const width of [320,768])for(const route of ['/admin/','/admin/#content','/admin/#media','/admin/#analytics','/members/login/','/partners/login/','/apply/?role=partner']){await page.setViewportSize({width,height:900});await page.goto(base+route);await page.locator('#app h1').waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px overflow at ${route}`);}
 });
 fs.writeFileSync(path.resolve(root,'../deep-browser-results.json'),JSON.stringify(results,null,2));
 if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();child.kill();fs.rmSync(data,{recursive:true,force:true});});
