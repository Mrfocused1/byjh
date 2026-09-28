// Public-page integration audit. Read-only browser journeys and a disposable database.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'byjh-public-')),base='http://127.0.0.1:8191';
const child=spawn(process.env.PYTHON||'/opt/homebrew/bin/python3',['server.py','--port','8191'],{cwd:root,env:{...process.env,BYJH_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
const shots=process.env.BYJH_SCREENSHOTS||path.resolve(root,'../audit-screenshots');fs.mkdirSync(shots,{recursive:true});let browser;const errors=[],failed=[];
(async()=>{
 await new Promise((ok,fail)=>{child.stdout.once('data',ok);child.once('error',fail);child.stderr.once('data',d=>fail(new Error(String(d))));});
 browser=await chromium.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push(r.status()+' '+r.url());});
 for(const width of [320,768,1440])for(const route of ['/','/members/','/partners/','/gallery/','/contact/']){
  await page.setViewportSize({width,height:900});await page.goto(base+route+'?nointro');await page.locator('main h1').waitFor();
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();if(r.right<=innerWidth+1||!r.width)return false;for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement)if(['hidden','clip','auto','scroll'].includes(getComputedStyle(p).overflowX))return false;return true;}).map(e=>({tag:e.tagName,class:typeof e.className==='string'?e.className:'svg',right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))}));
  if(overflow.scroll>width+1)await page.screenshot({path:path.join(shots,'overflow.png'),fullPage:true});
  assert(overflow.scroll<=width+1,`${width}px overflow ${route}: `+JSON.stringify(overflow));

  await page.getByRole('button',{name:'Open navigation'}).click();assert(await page.getByRole('dialog',{name:'Main navigation',exact:true}).isVisible());await page.keyboard.press('Escape');
  assert.equal(await page.locator('#menu').isVisible(),false);
  // Exercise deferred images without executing outbound links or enquiry delivery.
  await page.evaluate(()=>document.querySelectorAll('img[loading="lazy"]').forEach(i=>i.loading='eager'));
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete));
  const broken=await page.evaluate(()=>[...document.images].filter(i=>i.getAttribute('src')&&!i.naturalWidth).map(i=>i.getAttribute('src')));assert.deepEqual(broken,[],`broken images ${route}`);
  if(width===1440)await page.screenshot({path:path.join(shots,'public-'+(route==='/'?'home':route.replaceAll('/',''))+'.png')});
 }
 console.log('PASS public pages at 320, 768 and 1440px; images and navigation dialogs');
 await page.goto(base+'/?nointro');await page.locator('[data-vehicle="anniversary"]').first().click();await page.getByRole('dialog',{name:'Anniversary',exact:true}).waitFor();assert(await page.locator('#vehicle-specs details').count()>0);await page.keyboard.press('Escape');
 await page.locator('#explore-cabin').click();assert(await page.getByRole('dialog',{name:'Anniversary.',exact:true}).isVisible());await page.keyboard.press('Escape');
 await page.goto(base+'/gallery/?nointro');await page.locator('[data-media]').first().click();assert(await page.locator('#media-dialog').isVisible());const first=await page.locator('#media-counter').innerText();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#media-counter').innerText(),first);await page.keyboard.press('Escape');
 console.log('PASS fleet, cabin and gallery dialog controls');
 await page.goto(base+'/contact/?nointro');await page.locator('#contact-name').fill('QA Visitor');await page.locator('#contact-email').fill('qa@example.invalid');await page.locator('#contact-message').fill('A local audit enquiry. Do not send.');await page.getByRole('button',{name:'REVIEW ENQUIRY'}).click();await page.locator('#contact-review').waitFor();assert.match(await page.locator('#contact-summary').inputValue(),/QA Visitor/);await page.getByRole('button',{name:'EDIT DETAILS',exact:true}).click();assert.equal(await page.locator('#contact-name').inputValue(),'QA Visitor');
 console.log('PASS contact review and edit; no send action invoked');
 await page.goto(base+'/?nointro');await page.evaluate(()=>document.querySelector('#perspective').scrollIntoView());await page.locator('.horizontal-window').focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#horizontal-next').disabled);await page.keyboard.press('Home');await page.waitForFunction(()=>document.querySelector('#horizontal-prev').disabled);
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.body.classList.contains('horizontal-enabled'));assert.equal(await page.evaluate(()=>document.querySelector('#hero-film').paused),true);await page.goto(base+'/partners/?nointro');assert.equal(await page.evaluate(()=>window.BYJH.motion),false);
 console.log('PASS horizontal fleet keyboard controls and reduced-motion behavior');
 const visitor=await browser.newContext({viewport:{width:390,height:844}});await visitor.addInitScript(()=>Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false}));const v=await visitor.newPage();v.on('pageerror',e=>errors.push(e.message));await v.goto(base+'/');await v.locator('.byjh-intro-skip').waitFor();assert.match(await v.locator('.byjh-intro video').getAttribute('src'),/intro-mobile/);await v.keyboard.press('Escape');await v.waitForFunction(()=>!document.documentElement.classList.contains('byjh-intro-on'));await visitor.close();
 console.log('PASS mobile intro and keyboard skip');
 assert.deepEqual(failed,[]);assert.deepEqual(errors,[]);console.log('PASS no HTTP errors or JavaScript errors during the public audit');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();child.kill();fs.rmSync(data,{recursive:true,force:true});});
