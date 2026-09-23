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
      `BYJH — ${type.selectedOptions[0].textContent}`,
      '',
      `Name: ${data.get('name').trim()}`,
      `Email: ${data.get('email').trim()}`,
      `Phone: ${data.get('phone').trim() || 'Not provided'}`
    ];
    if (type.value === 'journey') {
      lines.push('', `Vehicle: ${vehicle.selectedOptions[0].textContent}`,
        `Date: ${data.get('date') || 'To be confirmed'}`,
        `Starting location: ${data.get('pickup').trim() || 'To be confirmed'}`,
        `Duration: ${data.get('duration') || 'To be confirmed'}`);
    }
    lines.push('', 'Message:', data.get('message').trim());
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
    const subject = `BYJH enquiry — ${type.selectedOptions[0].textContent}`;
    location.href = `mailto:${RECIPIENTS.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summary.value)}`;
    status.textContent = 'Your email app should now be open. Press send there to complete your enquiry.';
  });
  document.querySelector('#copy-enquiry').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(summary.value);
      status.textContent = 'Enquiry copied to your clipboard.';
    } catch {
      summary.focus(); summary.select();
      status.textContent = 'Select and copy your enquiry above.';
    }
  });
})();
