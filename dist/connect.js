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
  // Instagram: footer (every page), the menu, and the contact page intro. Added here so page markup (and the admin's
  // field positions) stay unchanged.
  const IG='https://www.instagram.com/cozeebyjh/';
  const igIcon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>';
  const igLink=(cls,text)=>{const a=document.createElement('a');a.className='byjh-instagram '+cls;a.href=IG;a.target='_blank';a.rel='noopener';
    a.setAttribute('aria-label',C('social.instagramLabel','BYJH on Instagram (opens in a new tab)'));a.innerHTML=igIcon+'<span>'+esc(text)+'</span>';return a;};
  document.querySelector('.footer-bottom')?.append(igLink('in-footer',C('social.handle','@cozeebyjh')));
  document.querySelector('.menu-dialog')?.append(igLink('in-menu',C('social.handle','@cozeebyjh')));
  const lead=document.querySelector('.contact-heading .contact-lead');
  if(lead){const p=document.createElement('p');p.className='contact-social';p.append(igLink('in-contact',C('social.follow','Follow us on Instagram')));lead.after(p);}
  const footer=document.querySelector('footer');
  if(footer){const links=document.createElement('div');links.className='byjh-footer-access';links.innerHTML=`<a href="/admin/">${B.h("ui.public.63a139fe57","Private office")}</a>`;footer.append(links);}
})();

}
