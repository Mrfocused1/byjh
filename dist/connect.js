{
  const B=window.BYJHCopy||{t:(_key,fallback,values={})=>fallback.replace(/\{([A-Za-z_][\w]*)\}/g,(match,key)=>key in values?String(values[key]):match),h(key,fallback,values){return this.t(key,fallback,values).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};
/* Public membership and partnership entry points. Accounts aren't offered on this site, so joining goes through the contact form. */
(()=>{
  if(!window.BYJH_COPY)return;

  const C=(key,fallback)=>(window.BYJH_COPY||{})[key]??fallback;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pagePath=location.pathname.replace(/index\.html$/,'').replace(/^(\/(?:members|partners|gallery|contact))$/,'$1/');
  const role=pagePath.startsWith('/partners')?'partner':'member';
  if(/^\/(members|partners)\/?$/.test(pagePath)){
    const dock=document.createElement('div');dock.className='byjh-join-dock';
    dock.innerHTML=`<a href="/contact/">${esc(C(role+'.contact',`Already a ${role}? Contact us`))}</a><button type="button">${esc(C(role+'.join',`Become a ${role}`))}<span aria-hidden="true">↗</span></button>`;
    dock.querySelector('button').onclick=()=>{location.href='/contact/?enquiry='+(role==='partner'?'partnership':'membership');};
    document.body.append(dock);
  }
  const footer=document.querySelector('footer');
  if(footer){const links=document.createElement('div');links.className='byjh-footer-access';links.innerHTML=`<a href="/admin/">${B.h("ui.public.63a139fe57","Private office")}</a>`;footer.append(links);}
})();

}
