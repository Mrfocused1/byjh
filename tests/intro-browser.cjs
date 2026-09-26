// Browser regression for the logo intro: install puppeteer-core separately, then run this file with
// PUPPETEER_EXECUTABLE_PATH pointing to Chrome and BYJH_QA_URL to the running site.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

const base = (process.env.BYJH_QA_URL || 'http://127.0.0.1:8765/').replace(/\/$/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const introState = page => page.evaluate(() => ({
  covering: document.documentElement.classList.contains('byjh-intro-on'),
  overlays: document.querySelectorAll('.byjh-intro').length,
  source: document.querySelector('.byjh-intro video')?.currentSrc || ''
}));

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, headless: true });
  const errors = [];
  async function visitorPage() {
    const page = await browser.newPage();
    // The intro deliberately skips automated browsers; present as a normal visitor here.
    await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
    page.on('pageerror', error => errors.push(error.message));
    return page;
  }
  try {
    const page = await visitorPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    let state = await introState(page);
    assert.ok(state.covering && state.overlays === 1, 'intro plays on arrival');
    assert.match(state.source, /intro-desktop\./);
    await page.waitForFunction(() => !document.documentElement.classList.contains('byjh-intro-on'), { timeout: 10000 });
    await sleep(700);
    assert.equal((await introState(page)).overlays, 0, 'intro removes itself');

    await page.click('a.cinema-scroll');
    await sleep(200);
    assert.equal((await introState(page)).overlays, 0, 'same-page anchors do not transition');

    await page.evaluate(() => scrollTo(0, 0));
    await page.click('.menu-toggle');
    await sleep(300);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#menu nav a[href="/members/"]')]);
    await sleep(800);
    state = await introState(page);
    assert.ok(state.covering && state.overlays === 1, 'next page opens with the intro');
    await page.mouse.click(700, 450);
    await sleep(700);
    assert.equal((await introState(page)).covering, false, 'click skips the intro');

    await page.goBack({ waitUntil: 'domcontentloaded' });
    await sleep(300);
    assert.equal((await introState(page)).covering, false, 'back navigation shows the page directly');

    const mobile = await visitorPage();
    await mobile.emulate(puppeteer.KnownDevices['iPhone 14 Pro Max']);
    await mobile.goto(base + '/gallery/', { waitUntil: 'domcontentloaded' });
    await sleep(1200);
    assert.match((await introState(mobile)).source, /intro-mobile\./);

    const automated = await browser.newPage();
    await automated.goto(base + '/', { waitUntil: 'domcontentloaded' });
    assert.equal((await introState(automated)).covering, false, 'automated browsers skip the intro');

    assert.deepEqual(errors, []);
    console.log('Intro checks passed');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
