document.getElementById('current-year').textContent = new Date().getFullYear();

const STORAGE_KEY = 'lang-choice';
const store = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* ignore */ } },
};

// Track clicks on the referral link in Google Analytics (event: referral_click).
document.querySelectorAll('[data-track]').forEach((el) => {
  el.addEventListener('click', () => {
    if (typeof gtag === 'function') {
      gtag('event', el.dataset.track, {
        link_location: el.dataset.location,
        page_language: document.documentElement.lang,
      });
    }
  });
});

// Copy referral link to clipboard.
document.querySelectorAll('[data-copy]').forEach((btn) => {
  const originalText = btn.textContent.trim();
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = btn.dataset.copiedText;
      if (typeof gtag === 'function') {
        gtag('event', 'referral_copy', { page_language: document.documentElement.lang });
      }
    } catch (e) {
      window.prompt('', btn.dataset.copy);
      return;
    }
    setTimeout(() => { btn.textContent = originalText; }, 2000);
  });
});

// Remember an explicit language choice from the footer switcher.
document.querySelectorAll('[data-lang-choice]').forEach((a) => {
  a.addEventListener('click', () => store.set(a.dataset.langChoice));
});

// Suggest (never force) the visitor's browser language if we have a page for it.
(function languageBanner() {
  const dataEl = document.getElementById('lang-data');
  if (!dataEl) return;
  const data = JSON.parse(dataEl.textContent);

  const choice = store.get();
  if (choice) {
    // Visitor already picked a language; respect it and stay quiet.
    return;
  }

  const browserLangs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
    .map((l) => l.toLowerCase().split('-')[0]);

  // First browser language we have a page for.
  let suggestion = null;
  for (const bl of browserLangs) {
    suggestion = data.languages.find((o) => o.browserLangs.includes(bl));
    if (suggestion) break;
  }
  if (!suggestion || suggestion.lang === data.current) return;

  const banner = document.createElement('div');
  banner.className = 'lang-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('lang', suggestion.lang);
  banner.innerHTML = `
    <span></span>
    <a href="${suggestion.path}" hreflang="${suggestion.lang}"></a>
    <button type="button"></button>`;
  banner.querySelector('span').textContent = suggestion.text;
  banner.querySelector('a').textContent = suggestion.cta + ' →';
  const close = banner.querySelector('button');
  close.textContent = '×';
  close.setAttribute('aria-label', suggestion.close);

  banner.querySelector('a').addEventListener('click', () => store.set(suggestion.lang));
  close.addEventListener('click', () => {
    store.set(data.current);
    banner.remove();
  });

  document.body.prepend(banner);
})();
