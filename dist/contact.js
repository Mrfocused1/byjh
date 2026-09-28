{
  const B=window.BYJHCopy||{t:(_key,fallback,values={})=>fallback.replace(/\{([A-Za-z_][\w]*)\}/g,(match,key)=>key in values?String(values[key]):match),h(key,fallback,values){return this.t(key,fallback,values).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}};
/* Enquiry review; sending opens the visitor's email app addressed to BYJH. */
(() => {

  'use strict';
  const form = document.querySelector('#contact-form');
  if (!form) return;
  const review = document.querySelector('#contact-review');
  const journey = document.querySelector('#journey-fields');
  const type = document.querySelector('#contact-type');
  const vehicle = document.querySelector('#contact-vehicle');
  const date = document.querySelector('#contact-date');
  const summary = document.querySelector('#contact-summary');
  const status = document.querySelector('#contact-status');
  const send = document.querySelector('#send-enquiry');
  const RECIPIENTS = ['info@byjh.co.uk', 'remmie@byjh.co.uk'];
  const today = new Date();
  date.min = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  function updateType() {
    journey.hidden = type.value !== 'journey';
    journey.disabled = journey.hidden;
  }
  const params = new URLSearchParams(location.search);
  const requestedVehicle = params.get('vehicle');
  if ([...vehicle.options].some(option => option.value === requestedVehicle)) vehicle.value = requestedVehicle;
  if (['journey', 'custom-build', 'membership', 'partnership', 'general'].includes(params.get('enquiry'))) type.value = params.get('enquiry');
  type.addEventListener('change', updateType);
  updateType();

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const lines = [
      B.t("ui.public.5416951f64","BYJH — {textContent}",{"textContent":type.selectedOptions[0].textContent}),
      '',
      B.t("ui.public.a1f37535e2","Name: {value1}",{"value1":data.get('name').trim()}),
      B.t("ui.public.cad2e05287","Email: {value1}",{"value1":data.get('email').trim()}),
      B.t("ui.public.a6f67a777b","Phone: {value1}",{"value1":data.get('phone').trim() || B.t("ui.public.20a0418296","Not provided")})
    ];
    if (type.value === 'journey') {
      lines.push('', B.t("ui.public.7ae8f76282","Vehicle: {textContent}",{"textContent":vehicle.selectedOptions[0].textContent}),
        B.t("ui.public.ef6fdbb200","Date: {value1}",{"value1":data.get('date') || B.t("ui.public.4efd6f827c","To be confirmed")}),
        B.t("ui.public.9a0d1c2269","Starting location: {value1}",{"value1":data.get('pickup').trim() || B.t("ui.public.4efd6f827c","To be confirmed")}),
        B.t("ui.public.2b4b82c8bb","Duration: {value1}",{"value1":data.get('duration') || B.t("ui.public.4efd6f827c","To be confirmed")}));
    }
    lines.push('', B.t("ui.public.9e029599e5","Message:"), data.get('message').trim());
    summary.value = lines.join('\n');
    form.hidden = true;
    review.hidden = false;
    status.textContent = '';
    document.querySelector('#contact-review-title').focus({ preventScroll: true });
    review.scrollIntoView({ behavior: window.BYJH.motion ? 'smooth' : 'instant', block: 'start' });
  });
  document.querySelector('#edit-enquiry').addEventListener('click', () => {
    review.hidden = true; form.hidden = false;
    document.querySelector('#contact-name').focus({ preventScroll: true });
    form.scrollIntoView({ behavior: window.BYJH.motion ? 'smooth' : 'instant', block: 'start' });
  });
  send.addEventListener('click', () => {
    const subject = B.t("ui.public.7a159b62f0","BYJH enquiry — {textContent}",{"textContent":type.selectedOptions[0].textContent});
    location.href = `mailto:${RECIPIENTS.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary.value)}`;
    status.textContent = B.t("ui.public.64c3e86b8e","Your email app should now be open. Press send there to complete your enquiry.");
  });
  document.querySelector('#copy-enquiry').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summary.value);
      status.textContent = B.t("ui.public.aeae243d69","Enquiry copied to your clipboard.");
    } catch {
      summary.focus(); summary.select();
      status.textContent = B.t("ui.public.ec58d0c7ae","Select and copy your enquiry above.");
    }
  });
})();

}
