const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Run the shipped homepage controller against mobile viewport/scroll events.
// Geometry is fixed so toolbar changes cannot legitimately move the fleet.
function homepage(touch = true) {
  const callbacks = new Map(), frames = new Map(), nodes = new Map();
  let frameId = 0, time = 0, pathReads = 0;
  const context = {
    innerWidth: 390, innerHeight: 700, scrollY: 5600,
    location: { hash: '' },
    matchMedia: () => ({ matches: touch }),
    requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; },
    ResizeObserver: class { observe() {} },
    getComputedStyle: () => ({ paddingTop: '260', getPropertyValue: () => '70' }),
    addEventListener(type, fn) { callbacks.set(type, fn); }
  };
  function node(selector) {
    if (nodes.has(selector)) return nodes.get(selector);
    const properties = new Map(), events = new Map();
    const el = {
      style: {
        setProperty(key, value) { properties.set(key, value); },
        getPropertyValue(key) { return properties.get(key) || ''; }
      },
      classList: { toggle() {} },
      dataset: { chapter: '04 / EVERY JOURNEY', panelLabel: selector },
      clientWidth: 390, offsetWidth: 340, offsetHeight: 700,
      scrollWidth: 3390, offsetTop: 0, offsetLeft: 0,
      textContent: '', events,
      addEventListener(type, fn) { events.set(type, fn); },
      setAttribute() {},
      getBoundingClientRect() { return { top: 1000 + el.offsetTop - context.scrollY }; },
      getTotalLength() { return 10000; },
      getPointAtLength(distance) { pathReads++; return { x: distance * .1, y: distance * .9 }; }
    };
    nodes.set(selector, el);
    return el;
  }
  node('#perspective').offsetTop = 3000;
  node('.road-turn').offsetTop = 1500;
  const panels = Array.from({ length: 9 }, (_, i) => {
    const el = node(`panel-${i}`); el.offsetLeft = i * 375; return el;
  });
  const images = [node('image-1'), node('image-2')];
  const groups = {
    '.horizontal-panel': panels,
    '.chapter': [node('#perspective')],
    '#road path': [node('.road-surface')],
    img: images
  };
  context.document = {
    body: node('body'), documentElement: { scrollHeight: 12000 },
    querySelector: node,
    querySelectorAll: selector => groups[selector] || [],
    fonts: { ready: { then(fn) { fn(); } } }
  };
  context.window = context;
  context.BYJH = { motion: true, scrollPosition: () => context.scrollY };
  vm.createContext(context);
  for (const file of ['vehicle-motion.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), context);
  }
  function settle() {
    for (let i = 0; frames.size && i < 300; i++) {
      const pending = [...frames.values()]; frames.clear(); time += 16.7;
      pending.forEach(fn => fn(time));
    }
    assert.equal(frames.size, 0, 'animation must settle');
  }
  settle();
  return {
    node, context, images, settle,
    get pathReads() { return pathReads; },
    resize(width, height) {
      context.innerWidth = width; context.innerHeight = height;
      callbacks.get('resize')(); settle();
    },
    scroll(y) { context.scrollY = y; callbacks.get('scroll')(); settle(); },
    motion(enabled) { callbacks.get('byjh:motion')({ detail: enabled }); settle(); }
  };
}

test('Safari toolbar resizing leaves fleet position and scroll distance stable', () => {
  const page = homepage();
  const position = page.node('.horizontal-track').style.transform;
  const height = page.node('#perspective').style.getPropertyValue('--horizontal-total');
  for (const viewportHeight of [720, 750, 790, 750, 700]) {
    const before = page.pathReads;
    page.resize(390, viewportHeight);
    assert.equal(page.node('.horizontal-track').style.transform, position);
    assert.equal(page.node('#perspective').style.getPropertyValue('--horizontal-total'), height);
    assert.ok(page.pathReads - before < 100, 'toolbar movement must not resample 2,501 road points');
  }
});

test('reserved image loads do not rebuild scroll geometry mid-gesture', () => {
  const page = homepage();
  const before = page.pathReads;
  page.images.forEach(img => img.events.get('load')?.());
  page.settle();
  assert.equal(page.pathReads, before);
});

test('a swipe follows the same path while Safari expands and collapses its toolbar', () => {
  const page = homepage(), reference = homepage();
  for (const [scroll, height] of [[5620, 720], [5680, 770], [5780, 790], [5740, 750], [5660, 700]]) {
    page.resize(390, height);
    page.scroll(scroll);
    reference.scroll(scroll);
    assert.equal(page.node('.horizontal-track').style.transform, reference.node('.horizontal-track').style.transform);
  }
});

test('desktop height changes still update the available scroll range', () => {
  const page = homepage(false);
  const height = page.node('#perspective').style.getPropertyValue('--horizontal-total');
  page.resize(390, 900);
  assert.notEqual(page.node('#perspective').style.getPropertyValue('--horizontal-total'), height);
});

test('rotation still rebuilds geometry and scrolling remains reversible', () => {
  const page = homepage();
  const before = page.pathReads;
  page.resize(844, 600);
  assert.ok(page.pathReads - before >= 2501);
  const position = page.node('.horizontal-track').style.transform;
  page.scroll(5800);
  assert.notEqual(page.node('.horizontal-track').style.transform, position);
  page.scroll(5600);
  assert.equal(page.node('.horizontal-track').style.transform, position);
  page.motion(false);
  assert.equal(page.node('.horizontal-track').style.transform, 'none');
});
