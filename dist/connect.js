{
  const B=window.BYJHCopy||{t:(_key,fallback,values={})=>fallback.replace(/\{([A-Za-z_][\w]*)\}/g,(match,key)=>key in values?String(values[key]):match),h(key,fallback,values){return this.t(key,fallback,values).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};
/* Public membership and partnership entry points; persisted by the local server. */
(()=>{
  // Accounts need server.py, which injects BYJH_COPY into every page. Static hosting has no backend, so show no entry points there.
  if(!window.BYJH_COPY)return;

  const C=(key,fallback)=>(window.BYJH_COPY||{})[key]??fallback;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pagePath=location.pathname.replace(/index\.html$/,'').replace(/^(\/(?:members|partners|gallery|contact))$/,'$1/');
  const role=pagePath.startsWith('/partners')?'partner':'member';
  const relevant=/^\/(members|partners)\/?$/.test(pagePath);
  function openApplication(selectedRole){
    let dialog=document.querySelector('#byjh-application');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='byjh-application';dialog.className='byjh-application';dialog.setAttribute('aria-label',B.t("ui.public.93a509f5ef","BYJH application"));dialog.innerHTML=`<button class="byjh-application-close" aria-label="${B.h("ui.public.b69e28ef14","Close application")}">×</button><iframe title="${B.h("ui.public.2553aa056c","BYJH application form")}"></iframe>`;document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});}
    const frame=dialog.querySelector('iframe');if(frame.dataset.role!==selectedRole){frame.src='/apply/?role='+selectedRole+'&embedded=1'+(new URLSearchParams(location.search).get('preview')==='1'?'&preview=1':'');frame.dataset.role=selectedRole;}dialog.showModal();
  }
  if(relevant){const dock=document.createElement('div');dock.className='byjh-join-dock';dock.innerHTML=`<a href="/${role}s/login/">${esc(C(role+'.signin',`Already a ${role}? Sign in`))}</a><button type="button">${esc(C(role+'.join',`Become a ${role}`))}<span aria-hidden="true">↗</span></button>`;dock.querySelector('button').onclick=()=>openApplication(role);document.body.append(dock);}
  const header=document.querySelector('.header-right');if(header){const a=document.createElement('a');a.href=`/${role}s/login/`;a.className='byjh-access';a.textContent=C(role+'.access',role.toUpperCase()+B.t("ui.public.1051a26d96"," LOGIN"));header.prepend(a);}
  const footer=document.querySelector('footer');if(footer){const links=document.createElement('div');links.className='byjh-footer-access';links.innerHTML=`<a href="/members/login/">${B.h("ui.public.d4133ad73b","Member login")}</a><a href="/partners/login/">${B.h("ui.public.babff0f460","Partner login")}</a><a href="/admin/">${B.h("ui.public.63a139fe57","Private office")}</a>`;footer.append(links);}
  document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const href=a.getAttribute('href');if(href?.includes('enquiry=membership')||href?.includes('enquiry=partnership')){e.preventDefault();e.stopImmediatePropagation();openApplication(href.includes('membership')?'member':'partner');}},true);
  fetch('/api/track',{method:'POST',headers:{'Content-Type':'application/json','X-BYJH':'1'},body:JSON.stringify({path:location.pathname.replace(/index\.html$/,'').replace(/^(\/(?:members|partners|gallery|contact))$/,'$1/'),device:innerWidth<600?'mobile':innerWidth<1000?'tablet':'desktop',referrer:document.referrer}),keepalive:true}).catch(()=>{
  const C=(key,fallback)=>(window.BYJH_COPY||{})[key]??fallback;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));});
})();

}
