// Browser regression: install puppeteer-core separately, then run this file with
// PUPPETEER_EXECUTABLE_PATH pointing to Chrome and BYJH_QA_URL to the running site.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: true
  });
  const url = process.env.BYJH_QA_URL || 'http://127.0.0.1:8765/';
  try {
    for (const mode of ['mobile', 'desktop', 'fallback']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (mode === 'desktop') await page.setViewport({ width: 1440, height: 900 });
      else await page.emulate(puppeteer.KnownDevices['iPhone 14 Pro Max']);
      if (mode === 'fallback') {
        await page.evaluateOnNewDocument(() => { window.ScrollTimeline = undefined; });
      }
      await page.goto(url, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => document.body.classList.contains('sprites-ready'));
      await page.evaluate(() => {
        const section = document.querySelector('#perspective');
        scrollTo({
          top: section.getBoundingClientRect().top + scrollY + parseFloat(getComputedStyle(section).paddingTop) + 1200,
          behavior: 'instant'
        });
      });
      await page.waitForFunction(() => Math.abs(document.querySelector('.horizontal-sticky').getBoundingClientRect().top) < 1);
      await page.waitForFunction(() => {
        const progress = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.page-progress i')).transform).a;
        return Math.abs(progress - scrollY / (document.documentElement.scrollHeight - innerHeight)) * innerWidth < .1;
      });
      const native = await page.evaluate(() => document.querySelector('.horizontal-track').getAnimations().length);
      assert.equal(native, mode === 'fallback' ? 0 : 1, `${mode}: expected scroll animation path`);
      const cdp = await page.createCDPSession();
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.profile-vehicle' });
      const { node } = await cdp.send('DOM.describeNode', { nodeId });
      let layers = [];
      cdp.on('LayerTree.layerTreeDidChange', event => {
        layers = event.layers || [];
      });
      const vehiclePaints = () => layers.filter(layer => layer.backendNodeId === node.backendNodeId).reduce((sum, layer) => sum + layer.paintCount, 0);
      await cdp.send('LayerTree.enable');
      for (const direction of [-1, 1]) {
        const paintsBefore = vehiclePaints();
        await page.evaluate(() => {
          window.scrollFrames = [];
          window.recordScroll = true;
          function sample(t) {
            if (!window.recordScroll) return;
            const track = document.querySelector('.horizontal-track').getBoundingClientRect();
            const progress = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.page-progress i')).transform).a;
            const expected = scrollY / (document.documentElement.scrollHeight - innerHeight);
            scrollFrames.push({ t, x: track.x, y: track.y, scroll: scrollY, progressError: Math.abs(progress - expected) * innerWidth });
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
        await cdp.send('Input.synthesizeScrollGesture', {
          x: 215, y: 400, yDistance: direction * 500, speed: 300,
          gestureSourceType: mode === 'desktop' ? 'mouse' : 'touch'
        });
        const frames = await page.evaluate(() => { window.recordScroll = false; return window.scrollFrames; });
        assert.ok(frames.length > 10, 'must observe the gesture, not just the end position');
        const first = frames[0], last = frames.at(-1);
        assert.ok((last.x - first.x) * direction > 100, `${mode}: scenery must follow the swipe`);
        const verticalRange = Math.max(...frames.map(f => f.y)) - Math.min(...frames.map(f => f.y));
        assert.ok(verticalRange < 1, `${mode}: pinned content bounced vertically by ${verticalRange}px`);
        const deltas = frames.slice(1).map((frame, i) => ({ dx: frame.x - frames[i].x, dt: frame.t - frames[i].t }));
        assert.ok(deltas.every(delta => delta.dx * direction >= -1), `${mode}: scenery reversed during one-direction scrolling`);
        const progressError = Math.max(...frames.map(frame => frame.progressError));
        assert.ok(layers.some(layer => layer.backendNodeId === node.backendNodeId), 'must observe the vehicle layer');
        const paints = vehiclePaints() - paintsBefore;
        console.log(`${mode}: progress error ${progressError.toFixed(3)}px; vehicle repaints ${paints}`);
        assert.ok(progressError < .25, `${mode}: header progress trails native scroll by ${progressError}px`);
        assert.ok(paints <= 3, `${mode}: rotating wheels repainted the vehicle ${paints} times`);
        console.log(`${mode} ${direction < 0 ? 'forward' : 'reverse'}: no bounce; max frame gap ${Math.max(...deltas.map(d => d.dt)).toFixed(1)} ms`);
      }
      await page.locator('#horizontal-next').click();
      await page.waitForFunction(() => document.querySelector('#horizontal-count').textContent.trim() !== '01 / 09');
      await page.focus('.horizontal-window');
      await page.keyboard.press('End');
      await page.waitForFunction(() => {
        const last = document.querySelector('.horizontal-panel:last-child').getBoundingClientRect();
        return document.querySelector('#horizontal-next').disabled && Math.abs(last.right - innerWidth) < 2;
      });
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => !document.querySelector('#horizontal-next').disabled);
      await page.keyboard.press('Home');
      await page.waitForFunction(() => document.querySelector('#horizontal-prev').disabled && Math.abs(document.querySelector('.horizontal-track').getBoundingClientRect().left) < 2);
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.waitForFunction(() => !document.body.classList.contains('horizontal-enabled'));
      assert.equal(await page.evaluate(() => document.querySelector('.horizontal-track').getAnimations().length), 0);
      assert.deepEqual(errors, []);
      console.log(`${mode}: controls, first/last panels, reduced motion and browser errors passed`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
