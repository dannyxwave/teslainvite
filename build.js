#!/usr/bin/env node
// Builds one static page per language from locales/*.json.
//
//   node build.js        → writes index.html (English) and one folder per language, plus sitemap.xml
//   node build.js --og   → also renders img/og-<lang>.png (needs Google Chrome)
//
// Edit texts in locales/*.json, never in the generated HTML files.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SITE = 'https://teslainvite.com';
const REFERRAL_CODE = 'danisak989381';
const GA_ID = 'G-9YW53C9QZJ';
// Date the content (and Tesla's offer) was last checked. Shown on the page, in
// structured data and in sitemap.xml. Bump it when you verify or change the text.
const LAST_UPDATED = '2026-11-22';
// First entry is the default language (served at "/" and used as x-default).
const LANG_ORDER = ['en', 'no', 'sv', 'da', 'de', 'fr', 'es', 'it', 'nl'];

const root = __dirname;
const locales = LANG_ORDER.map((code) =>
  JSON.parse(fs.readFileSync(path.join(root, 'locales', `${code}.json`), 'utf8')),
);
const defaultLocale = locales[0];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');
// Locale texts may contain {code}; replace it with the referral code.
const fill = (s) => String(s).replace(/\{code\}/g, REFERRAL_CODE);
// Intl locale for date formatting ("no" → Norwegian Bokmål).
const dateLocale = (l) => (l.lang === 'no' ? 'nb' : l.lang);
const formatDate = (l) =>
  new Intl.DateTimeFormat(dateLocale(l), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${LAST_UPDATED}T00:00:00Z`));
// Empty teslaLocale → link without country, Tesla picks the visitor's region.
const teslaUrl = (l) =>
  `https://www.tesla.com/${l.teslaLocale ? `${l.teslaLocale}/` : ''}referral/${REFERRAL_CODE}`;

// Inline script for the default page ("/" only): send the visitor to their browser
// language's page, unless they chose a language before or navigated here from the site.
// Pages for specific languages never redirect; they only show the suggestion banner.
function redirectScript() {
  const targets = locales.slice(1).map((o) => ({ p: o.path, b: o.browserLangs }));
  return `<script>
    (function () {
      var stay = ${JSON.stringify(defaultLocale.browserLangs)};
      var targets = ${JSON.stringify(targets)};
      try { if (localStorage.getItem('lang-choice')) return; } catch (e) {}
      try { if (document.referrer && new URL(document.referrer).origin === location.origin) return; } catch (e) {}
      var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < list.length; i++) {
        var code = String(list[i]).toLowerCase().split('-')[0];
        if (stay.indexOf(code) >= 0) return;
        for (var j = 0; j < targets.length; j++) {
          if (targets[j].b.indexOf(code) >= 0) {
            location.replace(targets[j].p + location.search + location.hash);
            return;
          }
        }
      }
    })();
  </script>`;
}
const ogImage = (l) => `${SITE}/img/og-${l.lang}.png`;

const arrowIcon =
  '<span class="cta-icon" aria-hidden="true"><svg height="24" width="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M16.172 11l-5.364-5.364 1.414-1.414L20 12l-7.778 7.778-1.414-1.414L16.172 13H4v-2z" fill="currentColor"></path></svg></span>';

function ctaLink(l, location) {
  return `<a class="cta" href="${teslaUrl(l)}" data-track="referral_click" data-location="${location}">
            ${l.cta}
            ${arrowIcon}
          </a>`;
}

function aboutSection(l) {
  if (!l.about) return '';
  const a = l.about;
  const img = a.image
    ? `<img class="about-img" src="${esc(a.image)}" alt="${esc(a.imageAlt || '')}" width="320" height="320" loading="lazy">`
    : '';
  return `
    <section class="section about">
      ${img}
      <div>
        <h2>${a.heading}</h2>
        ${a.paragraphs.map((p) => `<p>${p}</p>`).join('\n        ')}
      </div>
    </section>
`;
}

function page(l) {
  const pageUrl = `${SITE}${l.path}`;
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        url: `${SITE}/`,
        name: 'teslainvite.com',
        inLanguage: locales.map((o) => o.hreflang),
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: l.title,
        description: l.description,
        inLanguage: l.hreflang,
        isPartOf: { '@id': `${SITE}/#website` },
        primaryImageOfPage: ogImage(l),
        dateModified: LAST_UPDATED,
        about: { '@type': 'Brand', name: 'Tesla' },
        mainEntity: l.faq.map((f) => ({
          '@type': 'Question',
          name: stripTags(f.q),
          acceptedAnswer: { '@type': 'Answer', text: stripTags(fill(f.a)) },
        })),
      },
    ],
  };

  // Data for the language-suggestion banner in main.js.
  const langData = {
    current: l.lang,
    languages: locales.map((o) => ({
      lang: o.lang,
      path: o.path,
      browserLangs: o.browserLangs,
      text: o.bannerText,
      cta: o.bannerCta,
      close: o.bannerClose,
    })),
  };

  const alternates = locales
    .map((o) => `  <link rel="alternate" hreflang="${o.hreflang}" href="${SITE}${o.path}">`)
    .concat(`  <link rel="alternate" hreflang="x-default" href="${SITE}${defaultLocale.path}">`)
    .join('\n');

  const langSwitcher = locales
    .map((o) =>
      o.lang === l.lang
        ? `<span aria-current="page">${o.name}</span>`
        : `<a href="${o.path}" hreflang="${o.hreflang}" lang="${o.lang}" data-lang-choice="${o.lang}">${o.name}</a>`,
    )
    .join(' · ');

  return `<!DOCTYPE html>
<!-- Generated by build.js from locales/${l.lang}.json. Do not edit directly. -->
<html lang="${l.lang}">

<head>
  ${l === defaultLocale ? redirectScript() : ''}
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(l.title)}</title>
  <meta name="description" content="${esc(l.description)}">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#9138e5">

  <link rel="canonical" href="${SITE}${l.path}">
${alternates}

  <meta property="og:type" content="website">
  <meta property="og:locale" content="${l.ogLocale}">
${locales
  .filter((o) => o !== l)
  .map((o) => `  <meta property="og:locale:alternate" content="${o.ogLocale}">`)
  .join('\n')}
  <meta property="og:url" content="${SITE}${l.path}">
  <meta property="og:title" content="${esc(l.ogTitle)}">
  <meta property="og:description" content="${esc(l.ogDescription)}">
  <meta property="og:image" content="${ogImage(l)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" type="image/png" sizes="192x192" href="/favicon/android-chrome-192x192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
  <link rel="manifest" href="/favicon/site.webmanifest">
  <link rel="stylesheet" href="/main.css">

  <script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>
  <script type="application/json" id="lang-data">${JSON.stringify(langData)}</script>
</head>

<body>
  <main>
    <section class="hero finisher-header">
      <div class="hero-content">
        <p class="eyebrow">${l.eyebrow}</p>
        <h1>${l.h1}</h1>
        <p class="lead">${l.lead}</p>
        <div class="cta-row">
          ${ctaLink(l, 'hero')}
          <button class="copy" type="button" data-copy="${teslaUrl(l)}" data-copied-text="${esc(l.copied)}">
            ${l.copy}
          </button>
        </div>
        <p class="referral-code">${l.codeLabel}: <code>${REFERRAL_CODE}</code></p>
        <p class="fineprint">${l.fineprint}</p>
      </div>
    </section>

    <section class="section">
      <h2>${l.stepsHeading}</h2>
      <ol class="steps">
${l.steps
  .map(
    (s, i) => `        <li>
          <span class="step-num">${i + 1}</span>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </li>`,
  )
  .join('\n')}
      </ol>
    </section>
${aboutSection(l)}
    <section class="section">
      <h2>${l.faqHeading}</h2>
      <div class="faq">
${l.faq
  .map(
    (f) => `        <details>
          <summary>${f.q}</summary>
          <p>${fill(f.a)}</p>
        </details>`,
  )
  .join('\n')}
      </div>

      <div class="cta-row cta-bottom">
        ${ctaLink(l, 'bottom')}
      </div>
    </section>
  </main>

  <footer>
    <nav class="lang-switcher" aria-label="${esc(l.languageLabel)}">${langSwitcher}</nav>
    <p>${l.footerDisclaimer}</p>
    <p>${l.updatedLabel}: <time datetime="${LAST_UPDATED}">${formatDate(l)}</time></p>
    <p>&copy; <span id="current-year"></span> xCode</p>
  </footer>

  <script src="/finisher-header.es5.min.js"></script>
  <script src="/finisherHeader.js"></script>
  <script src="/main.js"></script>
</body>

</html>
`;
}

function sitemap() {
  const links = locales
    .map((o) => `    <xhtml:link rel="alternate" hreflang="${o.hreflang}" href="${SITE}${o.path}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${defaultLocale.path}"/>`)
    .join('\n');
  const urls = locales
    .map((l) => `  <url>\n    <loc>${SITE}${l.path}</loc>\n    <lastmod>${LAST_UPDATED}</lastmod>\n${links}\n  </url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

// Real 404 page. Without it, Cloudflare Pages answers every unknown URL with
// the front page and status 200 ("soft 404"), which search engines dislike.
function notFoundPage() {
  const links = locales
    .map((o) => `<a href="${o.path}" hreflang="${o.hreflang}" lang="${o.lang}">${o.name}</a>`)
    .join(' · ');
  return `<!DOCTYPE html>
<!-- Generated by build.js. Do not edit directly. -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Page not found | teslainvite.com</title>
  <meta name="robots" content="noindex">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="stylesheet" href="/main.css">
</head>
<body>
  <main>
    <section class="section">
      <h1>404</h1>
      <p>This page does not exist. <a href="/">Go to the front page</a>.</p>
      <nav class="lang-switcher" aria-label="Language">${links}</nav>
    </section>
  </main>
</body>
</html>
`;
}

function ogHtml(l) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#fff;
background:radial-gradient(circle at 15% 20%,#6bb4ff 0,transparent 45%),radial-gradient(circle at 85% 30%,#ff333d 0,transparent 45%),radial-gradient(circle at 60% 90%,#6e57ff 0,transparent 50%),#9138e5;
display:flex;flex-direction:column;justify-content:flex-end;padding:0 80px 80px;box-sizing:border-box}
p{margin:0 0 18px;font-size:28px;letter-spacing:.12em;text-transform:uppercase;opacity:.9}
h1{margin:0;font-size:104px;line-height:1;font-weight:900;text-transform:uppercase}
</style></head><body><p>${l.eyebrow}</p><h1>${l.h1}</h1></body></html>`;
}

function renderOgImages() {
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'og-'));
  for (const l of locales) {
    const htmlFile = path.join(tmp, `og-${l.lang}.html`);
    fs.writeFileSync(htmlFile, ogHtml(l));
    const out = path.join(root, 'img', `og-${l.lang}.png`);
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1200,630',
      `--screenshot=${out}`, `file://${htmlFile}`,
    ], { stdio: 'ignore' });
    console.log(`wrote img/og-${l.lang}.png`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

for (const l of locales) {
  const dir = path.join(root, l.path);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), page(l));
  console.log(`wrote ${path.join(l.path, 'index.html').replace(/^\//, '')}`);
}
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap());
console.log('wrote sitemap.xml');
fs.writeFileSync(path.join(root, '404.html'), notFoundPage());
console.log('wrote 404.html');

if (process.argv.includes('--og')) renderOgImages();
