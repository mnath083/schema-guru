const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.site-nav');

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });
}

const yearEl = document.querySelector('#year');
if (yearEl) {
  yearEl.textContent = String(new Date().getFullYear());
}

function trackEvent(eventName, payload = {}) {
  const data = { event: eventName, ...payload };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(data);
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, payload);
  }
}

const analyticsPage = document.body.getAttribute('data-analytics-page');
if (analyticsPage) {
  trackEvent('page_view', {
    page_type: analyticsPage,
    page_path: window.location.pathname,
    slug: document.body.getAttribute('data-analytics-slug') || undefined,
  });
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-analytics-event]') : null;
  if (!target) {
    return;
  }
  trackEvent(target.getAttribute('data-analytics-event'), {
    label: target.getAttribute('data-analytics-label') || undefined,
    page_path: window.location.pathname,
  });
});

const bookingButtons = document.querySelectorAll('[data-booking-type]');

function formatGCalDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

function buildInviteUrl(type, contextNote) {
  const normalizedType = type === 'enterprise' ? 'enterprise' : 'individual';
  const config = {
    individual: {
      title: 'PegaGuru LSA Readiness Session',
      durationMinutes: 45,
      details:
        'Focused LSA readiness session to evaluate architecture judgment, trade-offs, and decision defense under pressure.',
    },
    enterprise: {
      title: 'PegaGuru Architecture Advisory Session',
      durationMinutes: 60,
      details:
        'Architecture advisory session for enterprise teams to review active design decisions, risks, and ownership alignment.',
    },
  }[normalizedType];

  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  start.setHours(Math.max(9, start.getHours()));
  const end = new Date(start.getTime() + config.durationMinutes * 60 * 1000);

  const contextBlock = contextNote && contextNote.trim().length > 0
    ? `\n\nContext provided before scheduling:\n${contextNote.trim()}`
    : '\n\nContext provided before scheduling:\nNot provided.';
  const details = `${config.details}${contextBlock}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: config.title,
    dates: `${formatGCalDate(start)}/${formatGCalDate(end)}`,
    details,
    location: 'Google Meet',
    add: 'mnath083@gmail.com',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

if (bookingButtons.length > 0) {
  bookingButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      const bookingType = button.getAttribute('data-booking-type') || 'individual';
      const promptMessage = bookingType === 'enterprise'
        ? 'Briefly describe the architecture decision, risk, or system concern to review:'
        : 'Briefly describe the LSA scenario or architecture decision you want to pressure-test:';
      const contextNote = window.prompt(promptMessage, '');
      if (contextNote === null) {
        trackEvent('booking_cancelled', { booking_type: bookingType });
        return;
      }

      event.preventDefault();
      const inviteUrl = buildInviteUrl(bookingType, contextNote);
      trackEvent('booking_started', {
        booking_type: bookingType,
        context_provided: contextNote.trim().length > 0,
      });
      const openedWindow = window.open(inviteUrl, '_blank', 'noopener');
      if (!openedWindow) {
        trackEvent('booking_popup_blocked', { booking_type: bookingType });
        window.location.href = inviteUrl;
      }
    });
  });
}
