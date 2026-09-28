// Wording changes must render as plain text without changing values or account permissions.
const {chromium}=require('playwright');const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'byjh-copy-')),base='http://127.0.0.1:8192';
const child=spawn(process.env.PYTHON||'/opt/homebrew/bin/python3',['server.py','--port','8192'],{cwd:root,env:{...process.env,BYJH_DATA_DIR:data},stdio:['ignore','pipe','pipe']});let browser;const errors=[];
(async()=>{
 await new Promise((ok,fail)=>{child.stdout.once('data',ok);child.once('error',fail);child.stderr.once('data',d=>fail(new Error(String(d))));});
 browser=await chromium.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const admin=await browser.newContext({viewport:{width:1440,height:1050}}),member=await browser.newContext(),anon=await browser.newContext();
 for(const context of [admin,member,anon])context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 const post=(ctx,route,data)=>ctx.request.post(base+'/api/'+route,{data,headers:{'X-BYJH':'1'}});
 await post(admin,'setup',{name:'Copy QA',email:'owner@example.invalid',password:'copy-password-123'});
 await post(member,'apply',{role:'member',name:'Copy Member',email:'member@example.invalid',password:'copy-password-123',consent:true});
 const a=await admin.newPage(),m=await member.newPage(),v=await anon.newPage();await m.goto(base+'/account/');await m.getByText('Your application is with us.',{exact:true}).waitFor();
 await a.goto(base+'/admin/#content');await a.locator('[data-page="copy-account"]').click();const key='ui.account.604b516ec3';
 const input=a.locator('textarea[name="'+key+'"]');await input.fill('We’re considering your introduction.');await a.locator('#content-form button[type="submit"]').click();await a.getByText('Draft saved · ready to preview',{exact:true}).waitFor();
 const previewURL=await a.getByRole('link',{name:'Preview saved draft'}).getAttribute('href');assert.match(previewURL,/role=member/);assert.match(previewURL,/preview=1/);const preview=await admin.newPage();await preview.goto(base+previewURL);await preview.getByText('We’re considering your introduction.',{exact:true}).waitFor();
 await m.reload();await m.getByText('Your application is with us.',{exact:true}).waitFor();await a.locator('#publish').click();await a.getByText('Published content',{exact:false}).waitFor();await m.reload();await m.getByText('We’re considering your introduction.',{exact:true}).waitFor();
 await a.locator('.reset-copy[data-field="'+key+'"]').click();assert.equal(await input.inputValue(),'Your application is with us.');await a.locator('#content-form button[type="submit"]').click();await a.getByText('Draft saved · ready to preview',{exact:true}).waitFor();await a.locator('#publish').click();await a.getByText('Published content',{exact:false}).waitFor();
 console.log('PASS CMS edit, private account preview, publish and reset-to-default');
 // Challenge every authored UI field together. The probe must never become an HTML element.
 const catalog=(await (await admin.request.get(base+'/api/admin/content')).json()).pages.filter(p=>p.copyGroup);
 assert.equal(catalog.length,6);
 const probe='Copy <b data-copy-probe="true">literal & safe</b>';
 for(const page of catalog){const fields=Object.fromEntries(page.fields.map(f=>[f.id,probe+(f.parameters?.length?' '+f.parameters.map(p=>'{'+p+'}').join(' '):'')]));const save=await (await post(admin,'admin/content',{page:page.id,revision:page.revision,fields})).json();assert(save.ok,page.id+': '+JSON.stringify(save));const pub=await post(admin,'admin/publish',{page:page.id,revision:save.revision});assert.equal(pub.status(),200);}
 async function safe(page,route,ready='#app h1'){
  await page.goto(base+route);await page.reload();await page.locator(ready).first().waitFor();assert.equal(await page.locator('[data-copy-probe]').count(),0,'HTML escaped at '+route);
 }
 for(const hash of ['overview','applications','members','partners','content','media','analytics','requests','settings'])await safe(a,'/admin/#'+hash);
 await safe(a,'/admin/#members');await a.locator('.person-open').first().click();assert.equal(await a.locator('[data-copy-probe]').count(),0);assert.equal(await a.locator('#f-status').inputValue(),'pending');assert.match(await a.locator('#f-status option[value="pending"]').textContent(),/literal & safe/);await a.locator('.drawer .close').click();
 for(const section of ['overview','settings','requests'])await safe(m,'/account/#'+section);
 for(const role of ['member','partner'])for(const status of ['pending','active','declined','suspended']){await safe(preview,'/account/?preview=1&role='+role+'&status='+status);if(status==='active')assert(await preview.locator('#new-request').isDisabled());}
 for(const route of ['/admin/login/','/members/login/','/partners/login/','/apply/?role=member','/apply/?role=partner'])await safe(v,route);
 await safe(v,'/apply/?role=partner');assert.equal(await v.locator('#f-sector').inputValue(),'Hospitality');assert.match(await v.locator('#f-sector option[value="Hospitality"]').textContent(),/literal & safe/);
 for(const route of ['/','/members/','/partners/','/gallery/','/contact/'])await safe(v,route+'?nointro','main h1');
 await v.locator('#contact-name').fill('Literal visitor');await v.locator('#contact-email').fill('qa@example.invalid');await v.locator('#contact-message').fill('Test only. No delivery.');await v.locator('#contact-form button[type="submit"]').click();assert.match(await v.locator('#contact-summary').inputValue(),/literal & safe/);assert.equal(await v.locator('[data-copy-probe]').count(),0);
 await safe(v,'/members/login/');await v.locator('#f-email').fill('qa@example.invalid');await v.locator('#auth-password').fill('wrong-password-123');await v.locator('#auth-form button[type="submit"]').click();await v.locator('[data-error]').waitFor();assert.match(await v.locator('[data-error]').textContent(),/literal & safe/);assert.equal(await v.locator('[data-copy-probe]').count(),0);
 // Connection and malformed-response failures also use editable, escaped wording.
 await a.route('**/api/copy-connection-test',route=>route.abort());
 assert.match(await a.evaluate(async()=>{try{await W.api('copy-connection-test');}catch(e){return e.message;}}),/literal & safe/);
 await a.route('**/api/copy-response-test',route=>route.fulfill({status:200,contentType:'text/plain',body:'Invalid JSON'}));
 assert.match(await a.evaluate(async()=>{try{await W.api('copy-response-test');}catch(e){return e.message;}}),/literal & safe/);
 assert.deepEqual(errors,[]);console.log('PASS all copy groups escape HTML across admin, accounts, previews, applications, public screens and errors; option values unchanged; no browser errors');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();child.kill();fs.rmSync(data,{recursive:true,force:true});});
