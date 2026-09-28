/* Plain-text copy and named substitutions. Published wording never controls roles or routes. */
window.BYJHCopy=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t=(key,fallback,values={})=>String(window.BYJH_COPY?.[key]??fallback).replace(/\{([A-Za-z_][\w]*)\}/g,(match,name)=>Object.hasOwn(values,name)?String(values[name]):match);
  const h=(key,fallback,values)=>esc(t(key,fallback,values));
  // Keep browser validation meaningful while making the authored message editable.
  document.addEventListener('input',event=>event.target.setCustomValidity?.(''),true);
  document.addEventListener('change',event=>event.target.setCustomValidity?.(''),true);
  document.addEventListener('invalid',event=>{
    const input=event.target;if(!input.validity||!input.setCustomValidity)return;
    input.setCustomValidity('');const v=input.validity;let key='field.invalid',fallback='Please check this value.',params={};
    if(v.valueMissing){key='field.required';fallback='Please complete {field}.';params.field=input.labels?.[0]?.textContent.trim()||input.getAttribute('aria-label')||input.name;}
    else if(v.typeMismatch&&input.type==='email'){key='field.email';fallback='Please enter a valid email address.';}
    else if(v.typeMismatch&&input.type==='url'){key='field.url';fallback='Please enter a complete website address.';}
    else if(v.tooShort){key='field.short';fallback='Use at least {minimum} characters.';params.minimum=input.minLength;}
    else if(v.tooLong){key='field.long';fallback='Use no more than {maximum} characters.';params.maximum=input.maxLength;}
    else if(v.rangeUnderflow||v.rangeOverflow){key='field.range';fallback='Please enter a value from {minimum} to {maximum}.';params.minimum=input.min;params.maximum=input.max;}
    input.setCustomValidity(t('ui.shared.'+key,fallback,params));
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    if(!window.BYJH_COPY_PREVIEW)return;
    const banner=document.createElement('aside');banner.className='copy-preview-banner';banner.setAttribute('role','status');banner.textContent=t('ui.shared.preview.banner','Draft preview — changes are not submitted from this view.');
    document.body.prepend(banner);
  });
  return {t,h,esc};
})();
