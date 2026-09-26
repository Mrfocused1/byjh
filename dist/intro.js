/* BYJH logo intro and page transitions. Loaded synchronously in <head> so the
   page is covered before its first paint.
   - First page of a visit: the full logo intro (4s, skippable).
   - Following an internal link: the page fades to the intro colour, navigates,
     and the next page opens with the short logo stamp (0.9s).
   - Anything else (reload, back/forward, typing a URL mid-visit): no animation.
   Skipped entirely for reduced motion, Save-Data, automated browsers and ?nointro. */
(() => {
  'use strict';
  const BG = '#070408';
  const MEDIA = '/assets/intro/';
  const SEEN = 'byjh-intro-seen', TRANSITION = 'byjh-transition';
  const CUTS = {
    intro: { skippable: true, startWithin: 3500, maxLength: 9000 },
    stamp: { skippable: false, startWithin: 1500, maxLength: 3000 }
  };
  const root = document.documentElement;
  const navEntry = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  const disabled = matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.webdriver ||
    (navigator.connection && navigator.connection.saveData) || /[?&]nointro\b/.test(location.search);
  if (disabled) return;

  const store = {
    get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { sessionStorage.setItem(key, value); return true; } catch { return false; } },
    take(key) { const v = store.get(key); try { sessionStorage.removeItem(key); } catch {} return v; }
  };

  let overlay = null, video = null, themeMeta = null, previousTheme = null, finished = false;

  function setTheme(on) {
    themeMeta = themeMeta || document.querySelector('meta[name="theme-color"]');
    if (!themeMeta) return;
    if (on) { if (previousTheme === null) previousTheme = themeMeta.content; themeMeta.content = BG; }
    else if (previousTheme !== null) { themeMeta.content = previousTheme; previousTheme = null; }
  }

  function createOverlay(kind) {
    const el = document.createElement('div');
    el.className = 'byjh-intro byjh-intro--' + kind;
    document.body.append(el);
    return el;
  }

  function sourceFor(kind) {
    const cut = matchMedia('(max-aspect-ratio: 1/1)').matches ? 'mobile' : 'desktop';
    const probe = document.createElement('video');
    const webm = probe.canPlayType('video/webm; codecs="vp9"') === 'probably' && !/Apple/.test(navigator.vendor);
    return MEDIA + kind + '-' + cut + (webm ? '.webm' : '.mp4');
  }

  // ---- Arrival: play the intro or the stamp over the page -----------------
  function finish() {
    if (finished) return;
    finished = true;
    root.classList.remove('byjh-intro-on');
    setTheme(false);
    if (overlay) {
      const el = overlay;
      overlay = null;
      el.classList.add('is-leaving');
      if (video) video.pause();
      setTimeout(() => el.remove(), 600);
    }
    document.removeEventListener('keydown', onKey, true);
    window.dispatchEvent(new CustomEvent('byjh:intro-done'));
    prefetchStamp();
  }

  function onKey(event) {
    if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); finish(); }
  }

  function play(kind) {
    const cut = CUTS[kind];
    overlay = createOverlay(kind);
    overlay.append(video);
    if (cut.skippable) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'byjh-intro-skip';
      skip.textContent = 'SKIP';
      skip.setAttribute('aria-label', 'Skip intro');
      overlay.append(skip);
    }
    overlay.addEventListener('click', finish);
    document.addEventListener('keydown', onKey, true);
    video.addEventListener('playing', () => overlay && overlay.classList.add('is-playing'), { once: true });
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    // Never hold the site hostage: give up if playback has not started, and cap the total.
    setTimeout(() => { if (!video.currentTime) finish(); }, cut.startWithin);
    setTimeout(finish, cut.maxLength);
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(finish);
  }

  // Warm the cache so the first page change does not wait for the stamp video.
  let prefetched = false;
  function prefetchStamp() {
    if (prefetched) return;
    prefetched = true;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = sourceFor('stamp');
    link.as = 'video';
    document.head.append(link);
  }

  function arrivalKind() {
    if (navEntry && navEntry.type === 'back_forward') return null;
    if (store.take(TRANSITION)) return 'stamp';     // arrived through a page change
    if (store.get(SEEN)) return null;               // already had the intro this visit
    if (store.set(SEEN, '1')) return 'intro';       // first page of the visit
    // sessionStorage blocked: use the referrer to tell a page change from an arrival
    const internal = document.referrer && new URL(document.referrer).origin === location.origin;
    return internal ? 'stamp' : 'intro';
  }

  const kind = arrivalKind();
  if (kind) {
    root.classList.add('byjh-intro-on');
    setTheme(true);
    // Start fetching straight away; the element is attached once <body> exists.
    video = document.createElement('video');
    video.muted = video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.preload = 'auto';
    video.src = sourceFor(kind);
    const start = () => play(kind);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  } else {
    addEventListener('load', prefetchStamp, { once: true });
  }

  // ---- Departure: cover the page, then navigate ---------------------------
  function transitionTarget(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    const link = event.target.closest && event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return null;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return null; // same-page anchor
    if (/\.(mp4|webm|mov|jpe?g|png|webp|avif|gif|svg|pdf)$/i.test(url.pathname)) return null;          // media files
    return url;
  }

  document.addEventListener('click', event => {
    const url = transitionTarget(event);
    if (!url) return;
    event.preventDefault();
    finish();
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    store.set(TRANSITION, '1');
    const el = createOverlay('cover');
    el.classList.add('is-entering');
    overlay = el;
    setTheme(true);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    setTimeout(() => { location.href = url.href; }, 220);
  });

  // Coming back through the back/forward cache: drop any cover left from leaving.
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    store.take(TRANSITION);
    root.classList.remove('byjh-intro-on');
    setTheme(false);
    document.querySelectorAll('.byjh-intro').forEach(el => el.remove());
    overlay = null;
  });
})();
