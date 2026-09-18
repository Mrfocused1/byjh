/* Shared BYJH navigation, media and the same scroll-led vehicle treatment. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let motion = !reduced.matches;
  const state = window.BYJH = { motion };
  const { create: createVehicleMotion, clampScroll } = window.BYJHVehicleMotion;
  state.scrollPosition = () => clampScroll(scrollY, document.documentElement.scrollHeight - innerHeight);
  function setMotion(next) {
    motion = state.motion = next;
    document.body.classList.toggle('motion-off', !motion);
    window.dispatchEvent(new CustomEvent('byjh:motion', { detail: motion }));
  }
  reduced.addEventListener('change', e => setMotion(!e.matches));

  // Reserve each photo's existing space and show the actual BYJH mark until
  // decoding finishes. Cached images reveal immediately; failures stop pulsing.
  $$('.fleet-image').forEach(container => {
    const photo = $('img', container);
    if (!photo) return;
    const loader = document.createElement('span');
    loader.className = 'image-loading';
    loader.setAttribute('aria-hidden', 'true');
    container.append(loader);
    container.classList.add('image-pending');
    container.setAttribute('aria-busy', 'true');
    let settled = false, decoding = false;
    function failed() {
      if (settled) return;
      settled = true;
      container.classList.remove('image-pending');
      container.classList.add('image-failed');
      container.removeAttribute('aria-busy');
      loader.textContent = 'Image unavailable';
    }
    async function reveal() {
      if (settled || decoding) return;
      if (!photo.naturalWidth) { failed(); return; }
      decoding = true;
      try { await photo.decode(); } catch {}
      if (settled) return;
      settled = true;
      container.classList.remove('image-pending');
      container.removeAttribute('aria-busy');
      loader.remove();
    }
    photo.addEventListener('load', reveal, { once: true });
    photo.addEventListener('error', failed, { once: true });
    if (photo.complete) photo.naturalWidth ? reveal() : failed();
  });

  const dialogs = $$('dialog');
  let previousOverflow = '', updateHero = () => {};
  function openDialog(dialog) {
    if (!dialog || dialog.open) return;
    if (!dialogs.some(d => d.open)) previousOverflow = document.body.style.overflow;
    dialogs.forEach(d => { if (d.open) d.close(); });
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    updateHero();
  }
  dialogs.forEach(dialog => {
    $$('[data-close]', dialog).forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => {
      if (!dialogs.some(d => d.open)) document.body.style.overflow = previousOverflow;
      updateHero();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  });
  $('.menu-toggle')?.addEventListener('click', () => openDialog($('#menu')));
  $$('#menu nav a').forEach(a => a.addEventListener('click', () => $('#menu').close()));
  $('#explore-cabin')?.addEventListener('click', () => openDialog($('#cabin-dialog')));

  const vehicleDialog = $('#vehicle-dialog');
  if (vehicleDialog) {
    const fleet = JSON.parse($('#fleet-data').textContent);
    $$('[data-vehicle]').forEach(button => button.addEventListener('click', () => {
      const slug = button.dataset.vehicle, vehicle = fleet[slug];
      if (!vehicle) return;
      $('#vehicle-title').textContent = vehicle.name;
      $('#vehicle-kind').textContent = vehicle.model;
      $('#vehicle-capacity').textContent = `${vehicle.seats} SEATER / ${vehicle.model.toUpperCase()}`;
      const photo = $('#vehicle-photo');
      photo.src = vehicle.image;
      photo.alt = `${vehicle.name} — BYJH ${vehicle.model} interior`;
      const specifications = $('#vehicle-specs');
      specifications.replaceChildren();
      Object.entries(vehicle.specifications).forEach(([title, items], index) => {
        const group = document.createElement('details');
        group.open = index === 0;
        const summary = document.createElement('summary');
        summary.textContent = title;
        const list = document.createElement('ul');
        items.forEach(item => {
          const li = document.createElement('li'); li.textContent = item; list.append(li);
        });
        group.append(summary, list); specifications.append(group);
      });
      $('#vehicle-enquire').href = `/contact/?vehicle=${encodeURIComponent(slug)}`;
      openDialog(vehicleDialog);
    }));
  }

  const mediaDialog = $('#media-dialog');
  if (mediaDialog) {
    const image = $('#media-image'), video = $('#media-video'), title = $('#media-title');
    const previous = $('#media-prev'), next = $('#media-next'), counter = $('#media-counter');
    const gallery = $$('[data-media]');
    let active = 0, singleFilm = false;
    function clearMedia() {
      video.pause(); video.removeAttribute('src'); video.load();
      video.hidden = true; image.hidden = true;
    }
    function display(item) {
      clearMedia(); title.textContent = item.title;
      if (item.type === 'video') {
        video.poster = item.poster; video.src = item.src; video.hidden = false;
        video.muted = false;
        video.play().catch(() => {});
      } else {
        image.alt = item.alt; image.src = item.src; image.hidden = false;
      }
    }
    function showGallery(index) {
      active = clamp(index, 0, gallery.length - 1); singleFilm = false;
      const a = gallery[active];
      mediaDialog.classList.remove('single-film');
      display({type:a.dataset.media, src:a.href, title:a.dataset.title, poster:a.dataset.poster, alt:$('img',a).alt});
      counter.textContent = `${String(active + 1).padStart(2,'0')} / ${String(gallery.length).padStart(2,'0')}`;
      previous.disabled = active === 0; next.disabled = active === gallery.length - 1;
      openDialog(mediaDialog);
    }
    gallery.forEach((a,i) => a.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); showGallery(i);
    }));
    previous.addEventListener('click', () => showGallery(active - 1));
    next.addEventListener('click', () => showGallery(active + 1));
    mediaDialog.addEventListener('keydown', event => {
      if (singleFilm || event.target === video || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); showGallery(active + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
    mediaDialog.addEventListener('close', clearMedia);
    $$('[data-film]').forEach(button => button.addEventListener('click', () => {
      singleFilm = true; mediaDialog.classList.add('single-film');
      display({type:'video',src:button.dataset.film,poster:button.dataset.poster,title:button.dataset.title});
      openDialog(mediaDialog);
    }));
  }

  const hero = $('#hero-film'), play = $('#hero-play');
  if (hero) {
    let manuallyPaused = false, explicitPlay = false, visible = true, playPending = false;
    hero.muted = true; hero.defaultMuted = true;
    function syncButton() {
      if (!play) return;
      play.textContent = hero.paused ? 'PLAY FILM ▷' : 'PAUSE FILM Ⅱ';
      play.setAttribute('aria-label', hero.paused ? 'Play background film' : 'Pause background film');
    }
    updateHero = () => {
      const shouldPlay = (motion || explicitPlay) && !manuallyPaused && visible && !document.hidden && !dialogs.some(d => d.open);
      if (!shouldPlay) { hero.pause(); syncButton(); return; }
      if (hero.paused && !playPending) {
        playPending = true;
        hero.play().catch(() => {}).finally(() => { playPending = false; syncButton(); });
      }
    };
    if (play) play.addEventListener('click', () => {
      if (hero.paused) { manuallyPaused = false; explicitPlay = true; }
      else { manuallyPaused = true; explicitPlay = false; }
      updateHero();
    });
    hero.addEventListener('play', syncButton); hero.addEventListener('pause', syncButton);
    hero.addEventListener('error', () => { if (play) play.hidden = true; });
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateHero(); },{threshold:.1}).observe(hero);
    document.addEventListener('visibilitychange', updateHero);
    window.addEventListener('byjh:motion', () => { if (!motion) explicitPlay = false; updateHero(); });
    window.addEventListener('pageshow', updateHero);
    updateHero();
  }

  const route = $('.page-route');
  if (route) {
    const svg = $('.page-route-svg'), surface = $('.page-route-surface'), car = $('.route-car');
    const progress = $('.page-progress i');
    let length = 0, top = 0, height = 0, rendered = state.scrollPosition(), frame = 0, dirty = true, lastTime = 0;
    const vehicleMotion = createVehicleMotion(rendered);
    function measure() {
      const w = route.clientWidth; height = route.clientHeight; top = route.getBoundingClientRect().top + scrollY;
      const y = height * .51;
      const d = `M -320 ${y} L 0 ${y} C ${w*.3} ${y} ${w*.3} ${y+14} ${w*.55} ${y+14} S ${w*.8} ${y} ${w} ${y} L ${w+320} ${y}`;
      svg.setAttribute('width',w); svg.setAttribute('height',height);
      $$('path',svg).forEach(p => p.setAttribute('d',d)); length = surface.getTotalLength(); dirty = false;
      vehicleMotion.rebase(rendered);
    }
    function render(time) {
      frame = 0; if (dirty) measure();
      const dt = Math.min(64,lastTime ? time-lastTime : 16.7); lastTime = time;
      const targetScroll = state.scrollPosition();
      rendered += (targetScroll-rendered) * (motion ? 1-Math.exp(-dt/70) : 1);
      if (Math.abs(targetScroll-rendered) < .12) rendered = targetScroll;
      const amount = motion ? clamp((rendered - top + innerHeight*.72)/(innerHeight*.9 + height)) : .46;
      const p = surface.getPointAtLength(amount*length);
      const before = surface.getPointAtLength(Math.max(0,amount*length-4));
      const after = surface.getPointAtLength(Math.min(length,amount*length+4));
      const angle = Math.atan2(after.y-before.y,after.x-before.x)*180/Math.PI - 90;
      const steering = vehicleMotion.step(rendered, angle, dt, motion);
      car.style.transform = `translate3d(${p.x}px,${p.y}px,0) rotate(${steering.heading}deg)`;
      progress.style.transform = `scaleX(${clamp(scrollY / Math.max(1,document.documentElement.scrollHeight-innerHeight))})`;
      if (Math.abs(targetScroll-rendered)>.1 || steering.turning) requestRender();
    }
    function requestRender() { if (!frame) frame = requestAnimationFrame(render); }
    addEventListener('scroll', requestRender,{passive:true});
    addEventListener('resize', () => { dirty = true; requestRender(); },{passive:true});
    addEventListener('pageshow', () => { rendered = state.scrollPosition(); dirty = true; requestRender(); });
    addEventListener('byjh:motion', requestRender);
    document.fonts.ready.then(() => { dirty = true; requestRender(); });
    new ResizeObserver(() => { dirty = true; requestRender(); }).observe(document.body);
    requestRender();
  }

  /* Composite the generated photographic sprites against the page. The source
     sheet remains untouched; only its connected neutral studio matte is hidden
     in the in-page canvas. Enclosed vehicle highlights are retained. */
  function prepareSprites() {
    const source = new Image();
    source.src = '/assets/sprinter-views.png';
    source.onload = () => {
      const canvas = document.createElement('canvas');
      const w = canvas.width = source.naturalWidth, h = canvas.height = source.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(source, 0, 0);
      const pixels = context.getImageData(0, 0, w, h), data = pixels.data;
      const visited = new Uint8Array(w * h), queue = new Int32Array(w * h);
      let head = 0, tail = 0;
      const add = (i) => {
        if (i < 0 || i >= visited.length || visited[i]) return;
        visited[i] = 1;
        const p = i * 4, lo = Math.min(data[p], data[p + 1], data[p + 2]);
        const hi = Math.max(data[p], data[p + 1], data[p + 2]);
        if (data[p + 3] < 20 || (lo > 124 && hi - lo < 33)) queue[tail++] = i;
      };
      for (let x = 0; x < w; x++) { add(x); add((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { add(y * w); add(y * w + w - 1); }
      while (head < tail) {
        const i = queue[head++], x = i % w;
        data[i * 4 + 3] = 0;
        if (x > 0) add(i - 1);
        if (x < w - 1) add(i + 1);
        add(i - w); add(i + w);
      }
      context.putImageData(pixels, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        document.documentElement.style.setProperty('--sprite-sheet', `url("${url}")`);
        document.body.classList.add('sprites-ready');
        window.dispatchEvent(new Event('byjh:sprites'));
      }, 'image/png');
    };
    source.onerror = () => document.body.classList.add('asset-error');
  }


  prepareSprites();
  setMotion(motion);
})();
