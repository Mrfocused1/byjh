/* BYJH text motion: every piece of text blurs in word by word as it comes into view, and the page blurs out when
   leaving for another BYJH page. Cards and buttons get matching micro-motion. Ported from the BYJH app
   (app/src/onboarding/motion.js); Web Animations API only. Exposed as window.BYJHMotion. */
(()=>{
  'use strict';
  const root=document.documentElement;
  if(!Element.prototype.animate){root.classList.remove('bt-wait');return;}
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- springs and easings
  const supportsLinear=(()=>{try{return CSS.supports('animation-timing-function','linear(0, 0.5 50%, 1)');}catch{return false;}})();
  const springs=new Map();
  // Damped spring sampled into a CSS linear() easing; returns {easing, duration} in ms.
  function spring({stiffness=210,damping=22,mass=1}={}){
    const key=`${stiffness}|${damping}|${mass}`;
    if(springs.has(key))return springs.get(key);
    const dt=1/240,pts=[];let x=0,v=0,t=0,settled=0;
    while(t<3){
      const a=(-stiffness*(x-1)-damping*v)/mass;v+=a*dt;x+=v*dt;t+=dt;pts.push([t,x]);
      if(Math.abs(x-1)<0.0008&&Math.abs(v)<0.002){if(++settled>12)break;}else settled=0;
    }
    let easing;
    if(supportsLinear){
      const step=Math.max(1,Math.floor(pts.length/64)),stops=[];
      for(let i=0;i<pts.length;i+=step)stops.push(`${pts[i][1].toFixed(4)} ${(pts[i][0]/t*100).toFixed(2)}%`);
      easing=`linear(0, ${stops.join(', ')}, 1 100%)`;
    }else easing=Math.max(...pts.map(p=>p[1]))>1.02?'cubic-bezier(0.34, 1.4, 0.64, 1)':'cubic-bezier(0.22, 1, 0.36, 1)';
    const out={easing,duration:Math.round(t*1000)};springs.set(key,out);return out;
  }
  const EASE={out:'cubic-bezier(0.22, 1, 0.36, 1)',inOut:'cubic-bezier(0.65, 0, 0.35, 1)',in:'cubic-bezier(0.55, 0, 0.75, 0.2)',blur:'cubic-bezier(0.2, 0.75, 0.25, 1)'};
  const anim=(el,frames,opts={})=>{const a=el.animate(frames,{fill:'both',...opts});return a.finished.then(()=>a,()=>a);};

  // ---------------------------------------------------------------- words
  // Wrap every word in <span class="bw"> (inline-block, white-space: pre). Keeps <br> and inline elements.
  function splitWords(el){
    if(el._words)return el._words;
    const words=[];
    const walk=node=>{
      for(const child of [...node.childNodes]){
        if(child.nodeType===3){
          const parts=child.textContent.split(/(\s+)/);
          if(parts.every(p=>!p.trim()))continue;
          const frag=document.createDocumentFragment();
          for(const part of parts){
            if(!part)continue;
            if(!part.trim()){frag.appendChild(document.createTextNode(part));continue;}
            const s=document.createElement('span');s.className='bw';s.textContent=part;frag.appendChild(s);words.push(s);
          }
          child.replaceWith(frag);
        }else if(child.nodeType===1&&child.tagName!=='BR'&&!child.classList.contains('bw')&&!child.matches('svg,img,video,canvas,picture,input,select,textarea,button,[data-bt]')){
          walk(child);
        }
      }
    };
    walk(el);
    return el._words=words;
  }
  function setText(el,text){el.textContent=text;el._words=null;}

  // ---------------------------------------------------------------- blur in / out
  const PRESET={
    hero:{dur:1100,stagger:70,blur:16,y:0.42,scale:0.97},
    title:{dur:950,stagger:48,blur:14,y:0.36,scale:0.98},
    body:{dur:800,stagger:16,blur:10,y:0.30,scale:0.99},
    label:{dur:700,stagger:24,blur:8,y:0.25,scale:0.98},
    eyebrow:{dur:800,stagger:40,blur:10,y:0.20,scale:1},
  };
  const presetOf=el=>PRESET[el.dataset.bt]||PRESET.body;

  function blurIn(el,{delay=0,...over}={}){
    if(!el)return Promise.resolve();
    el.style.visibility='visible';
    if(reduced)return anim(el,[{opacity:0},{opacity:1}],{duration:300,delay,easing:'ease-out'}).then(a=>a.cancel());
    const p={...presetOf(el),...over};
    return Promise.all(splitWords(el).map((w,i)=>{
      w.getAnimations().forEach(a=>a.cancel());
      w.style.willChange='filter, transform, opacity';
      return anim(w,[{opacity:0,filter:`blur(${p.blur}px)`,transform:`translateY(${p.y}em) scale(${p.scale})`},{opacity:1,filter:'blur(0px)',transform:'none'}],
        {duration:p.dur,delay:delay+i*p.stagger,easing:EASE.blur}).then(a=>{a.cancel();w.style.willChange='';});
    }));
  }
  function blurOut(el,{delay=0,stagger,dur=420,blur,y=-0.22}={}){
    if(!el)return Promise.resolve();
    if(reduced)return anim(el,[{opacity:1},{opacity:0}],{duration:200,delay,easing:'ease-in'});
    const p=presetOf(el),st=stagger??Math.max(8,p.stagger*0.4);
    return Promise.all(splitWords(el).map((w,i)=>{
      const prev=w.getAnimations();
      const done=anim(w,[{opacity:1,filter:'blur(0px)',transform:'none'},{opacity:0,filter:`blur(${blur??p.blur}px)`,transform:`translateY(${y}em) scale(1.01)`}],
        {duration:dur,delay:delay+i*st,easing:EASE.in});
      prev.forEach(a=>a.cancel());
      return done;
    }));
  }
  // Replace an element's text: old words blur out, new words blur in.
  async function blurSwap(el,text,opts={}){
    if(!el||el.textContent===text)return;
    await blurOut(el,{dur:260,stagger:10,...opts.out});
    setText(el,text);
    return blurIn(el,{...opts.in});
  }

  // ---------------------------------------------------------------- blocks (cards, buttons)
  function popIn(el,{delay=0}={}){
    if(!el)return Promise.resolve();
    el.style.visibility='visible';
    if(reduced)return anim(el,[{opacity:0},{opacity:1}],{duration:300,delay,easing:'ease-out'}).then(a=>a.cancel());
    const s=spring({stiffness:320,damping:26});
    // Finished animations are cancelled so the element's own CSS (hover transforms, opacity) applies again.
    return Promise.all([
      anim(el,[{transform:'translateY(14px) scale(0.92)'},{transform:'none'}],{duration:s.duration,delay,easing:s.easing,composite:'add'}),
      anim(el,[{opacity:0,filter:'blur(10px)'},{opacity:1,filter:'blur(0px)'}],{duration:600,delay,easing:EASE.out}),
    ]).then(list=>list.forEach(a=>a.cancel()));
  }
  function popOut(el,{delay=0}={}){
    if(!el)return Promise.resolve();
    if(reduced)return anim(el,[{opacity:1},{opacity:0}],{duration:200,delay,easing:'ease-in'});
    return anim(el,[{opacity:1,filter:'blur(0px)',transform:'none'},{opacity:0,filter:'blur(8px)',transform:'translateY(-8px) scale(0.96)'}],{duration:360,delay,easing:EASE.in,composite:'add'});
  }
  const play=(el,opts)=>el.dataset.bt==='block'?popIn(el,opts):blurIn(el,opts);
  const leave=(el,opts)=>el.dataset.bt==='block'?popOut(el,opts):blurOut(el,opts);

  // ---------------------------------------------------------------- page entrance and exit
  const visible=el=>el.offsetParent!==null||getComputedStyle(el).position==='fixed';
  // Screen entrance: everything tagged is hidden, then blurs in in document order, 90ms apart. Elements below the
  // fold wait until they scroll into view, then cascade the same way with the others arriving alongside them.
  let queue=[],flushing=null;
  function enqueue(el){
    queue.push(el);
    if(!flushing)flushing=requestAnimationFrame(()=>{
      const batch=queue.sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
      queue=[];flushing=null;
      batch.forEach((el,i)=>play(el,{delay:i*90}));
    });
  }
  const io='IntersectionObserver' in window?new IntersectionObserver(entries=>{
    for(const e of entries)if(e.isIntersecting){io.unobserve(e.target);e.target._seen=true;enqueue(e.target);}
  },{threshold:0.01}):null;
  function observe(els){
    for(const el of els){
      if(el._btObserved)continue;el._btObserved=true;
      el.style.visibility='hidden';
      if(io)io.observe(el);else enqueue(el);
    }
  }
  function blurInAll(scope=document,{start=0,gap=90}={}){
    const els=[...scope.querySelectorAll('[data-bt]')].filter(visible);
    els.forEach(el=>{el.style.visibility='hidden';});
    return Promise.all(els.map((el,i)=>play(el,{delay:start+i*gap})));
  }
  function blurOutAll(scope=document,{gap=30}={}){
    const vh=innerHeight;
    const els=[...scope.querySelectorAll('[data-bt]')].filter(el=>{if(!visible(el)||!el._seen)return false;const r=el.getBoundingClientRect();return r.bottom>0&&r.top<vh;});
    return Promise.all(els.map((el,i)=>leave(el,{delay:i*gap})));
  }

  // ---------------------------------------------------------------- tagging
  // Which elements animate, and how ([selector, preset]; "block" = card/button micro-motion). Earlier rows win.
  const PUBLIC=[
    ['.hero h1,.page-intro h1,.cinema-copy h1,.contact-heading h1,main h1','hero'],
    ['main .eyebrow,footer .eyebrow','eyebrow'],
    ['main h2,main h3,.member-name,footer h2,footer h3','title'],
    ['main p,main li,main blockquote,main figcaption,main dt,main dd,footer p,footer li','body'],
    ['.brand,.byjh-brand,.header-pages a,.footer-pages a,.world-links a,main label,main legend','label'],
    ['.pill,.text-link,.text-button,.contact-action,.contact-option,.fleet-panel,.service,.gallery-image-wrap,.byjh-join-dock','block'],
  ];
  // The admin re-renders often, so only headings, the welcome panel and metrics move there.
  const ADMIN=[
    ['.auth-box h1','hero'],['.page-heading h1','title'],
    ['.auth-box .eyebrow-w,.page-heading .eyebrow-w,.auth-quote .eyebrow-w','eyebrow'],
    ['.auth-box .sub,.page-heading p,.auth-quote h2,.auth-quote p','body'],
    ['.metric,.welcome,.auth-box form','block'],
  ];
  const app=document.querySelector('#app');
  const ROLES=app?ADMIN:PUBLIC;
  // Decorative, scroll-driven or script-rewritten text, dialogs and form controls stay as they are.
  const SKIP='.hero-watermark,.side-word,.film-label,.route-label,.cabin-caption,.chapter-indicator,.passing-name,.member-no,.members-total,'+
    '.partners-total,#horizontal-count,.scroll-invitation,.service-symbol,.route-symbol,.service-arrow,.page-route,.route-car,.horizontal-meter,'+
    'dialog,.vehicle-modal,.media-dialog,[aria-hidden="true"],#contact-status,#review-note,.copy-preview-banner,.skip-link,textarea,select,[contenteditable]';
  function tag(scope=document){
    const found=[];
    for(const [selector,role] of ROLES){
      for(const el of scope.querySelectorAll(selector)){
        if(el.dataset.bt||(SKIP&&el.closest(SKIP))||!el.textContent.trim()&&role!=='block')continue;
        if(role!=='block'&&el.parentElement?.closest('[data-bt]:not([data-bt="block"])'))continue;
        el.dataset.bt=role;found.push(el);
      }
    }
    return found;
  }
  function start(){
    const found=tag();
    found.forEach(el=>{el.style.visibility='hidden';});
    root.classList.remove('bt-wait');
    // On the public site the intro film or page-change stamp plays first; text arrives once it has cleared.
    if(root.classList.contains('byjh-intro-on'))addEventListener('byjh:intro-done',()=>observe(found),{once:true});
    else observe(found);
    // The admin and sign-in pages render into #app with script; animate what they add.
    if(app)new MutationObserver(()=>observe(tag(app))).observe(app,{childList:true,subtree:true});
  }
  // Leaving for another page: intro.js calls blurOutAll() before its cover comes down. When intro.js is off (reduced
  // motion, Save-Data, automated browsers) or absent, blur out here, capped so navigation never drags.
  if(!window.BYJHIntro)document.addEventListener('click',e=>{
    if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    const a=e.target.closest('a[href]');
    if(!a||a.target&&a.target!=='_self'||a.hasAttribute('download'))return;
    const url=new URL(a.href,location.href);
    if(url.origin!==location.origin||!/^https?:$/.test(url.protocol)||url.pathname===location.pathname&&url.search===location.search)return;
    if(/\.(mp4|webm|mov|jpe?g|png|webp|avif|gif|svg|pdf)$/i.test(url.pathname))return;
    e.preventDefault();
    const go=()=>{location.href=url.href;};
    Promise.race([blurOutAll(),new Promise(r=>setTimeout(r,450))]).then(go,go);
  });
  // Coming back through the browser's back/forward cache: show everything as it was.
  addEventListener('pageshow',e=>{
    if(!e.persisted)return;
    for(const el of document.querySelectorAll('[data-bt]')){
      el.style.visibility='visible';el.getAnimations().forEach(a=>a.cancel());
      for(const w of el._words||[])w.getAnimations().forEach(a=>a.cancel());
    }
  });

  window.BYJHMotion={blurIn,blurOut,blurSwap,blurInAll,blurOutAll,popIn,popOut,splitWords,setText,spring,EASE,tag,observe,reduced};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
