/* Les comptes officiels de Meudon, réunis dans une même page. */
(() => {
  'use strict';

  const marks = {
    instagram: '<path fill-rule="evenodd" d="M7.1 2h9.8A5.1 5.1 0 0 1 22 7.1v9.8a5.1 5.1 0 0 1-5.1 5.1H7.1A5.1 5.1 0 0 1 2 16.9V7.1A5.1 5.1 0 0 1 7.1 2Zm0 1.9a3.2 3.2 0 0 0-3.2 3.2v9.8a3.2 3.2 0 0 0 3.2 3.2h9.8a3.2 3.2 0 0 0 3.2-3.2V7.1a3.2 3.2 0 0 0-3.2-3.2H7.1ZM12 6.85a5.15 5.15 0 1 1 0 10.3 5.15 5.15 0 0 1 0-10.3Zm0 1.9a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z"/><circle cx="17.45" cy="6.55" r="1.2"/>',
    youtube: '<path d="M23.3 6.4a3 3 0 0 0-2.1-2.1C19.3 3.8 12 3.8 12 3.8s-7.3 0-9.2.5A3 3 0 0 0 .7 6.4C.2 8.3.2 12 .2 12s0 3.7.5 5.6a3 3 0 0 0 2.1 2.1c1.9.5 9.2.5 9.2.5s7.3 0 9.2-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.6.5-5.6s0-3.7-.5-5.6ZM9.6 15.5v-7l6.1 3.5-6.1 3.5Z"/>',
    facebook: '<path d="M13.4 22v-9.1h3.1l.5-3.6h-3.6V7c0-1 .3-1.7 1.8-1.7h1.9V2.1A25.4 25.4 0 0 0 14.3 2c-2.8 0-4.7 1.7-4.7 4.8v2.5H6.5v3.6h3.1V22h3.8Z"/>',
    linkedin: '<path d="M5.1 7.8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6ZM3.2 9.5H7V21H3.2V9.5Zm5.8 0h3.6v1.6h.1A4 4 0 0 1 16.3 9c3.8 0 4.5 2.4 4.5 5.5V21H17v-5.8c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3V21H9V9.5Z"/>',
    x: '<path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.5 5.4 22H2.2l8.3-9.5L.8 2h6.5l4.5 6.9L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z"/>'
  };

  const presentation = {
    instagram: {
      line: 'Meudon, en images.',
      text: 'Les images, les lieux et les instants qui font la vie de Meudon.',
      photo: 'hero-observatoire.webp',
      alt: 'L’Observatoire de Meudon et ses jardins',
      caption: 'L’Observatoire de Meudon',
      width: 1920,
      height: 1285,
      format: 'PHOTOS & INSTANTS DE VILLE'
    },
    youtube: {
      line: 'La ville, en mouvement.',
      text: 'Les vidéos de la Ville, à découvrir et à regarder à votre rythme.',
      photo: 'hangar-y.webp',
      alt: 'La grande halle et la verrière colorée du Hangar Y',
      caption: 'Le Hangar Y',
      width: 1200,
      height: 540,
      format: 'VIDÉOS DE LA VILLE'
    },
    facebook: { line: 'La vie locale, dans votre fil.', text: 'Les informations pratiques et les rendez-vous municipaux.' },
    linkedin: { line: 'Meudon côté professionnel.', text: 'La vie institutionnelle et professionnelle de la Ville.' },
    x: { line: 'Le fil des publications.', text: 'Les publications du compte officiel de Meudon.' }
  };

  function logo(id) {
    return `<svg class="rh-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">${marks[id] || ''}</svg>`;
  }

  function panel(id, featured) {
    const channel = socialChannels.find(item => item.id === id);
    if (!channel) return '';
    const detail = presentation[id];
    const name = esc(channel.name);
    const photo = featured ? `<div class="rh-panel-photo"><img src="assets/${detail.photo}" alt="${esc(detail.alt)}" width="${detail.width}" height="${detail.height}" loading="lazy" decoding="async"><span class="rh-photo-caption">${esc(detail.caption)}</span><span class="rh-photo-format">${esc(detail.format)}</span></div>` : '';
    return `<a class="rh-panel rh-${id}${featured ? ' rh-featured' : ''}" href="${esc(channel.url)}" ${externalAttrs()} aria-label="${name} officiel de la Ville de Meudon — ouvrir dans un nouvel onglet">${photo}<div class="rh-panel-content"><div class="rh-panel-heading"><span class="rh-logo-box">${logo(id)}</span><div><span class="rh-platform-name">${name}</span><span class="rh-handle">${esc(channel.handle)}</span></div><span class="rh-external">${icon('arrow-up-right')}</span></div><h2>${esc(detail.line)}</h2><p>${esc(detail.text)}</p><span class="rh-panel-cta">Ouvrir le compte officiel ${icon('arrow-right')}</span></div></a>`;
  }

  window.retrouvezNousView = function retrouvezNousView() {
    return `${pageTop('La Ville', 'Retrouvez-nous.', 'Meudon se raconte aussi sur les réseaux. Choisissez votre façon de suivre la vie de la ville, ses images et ses rendez-vous.')}<section class="wrap page-content rh-page" aria-label="Les réseaux sociaux officiels de Meudon"><div class="rh-intro"><span class="eyebrow">LES COMPTES OFFICIELS DE LA VILLE</span><span class="rh-intro-note">${icon('external')} Chaque compte s’ouvre dans un nouvel onglet</span></div><div class="rh-feature-grid">${panel('instagram', true)}${panel('youtube', true)}</div><div class="rh-channel-grid">${panel('facebook', false)}${panel('linkedin', false)}${panel('x', false)}</div><aside class="rh-gallery"><div class="rh-gallery-photo"><img src="assets/etang-villebon.webp" alt="" width="1200" height="800" loading="lazy" decoding="async"></div><div class="rh-gallery-copy"><span class="eyebrow">LES ALBUMS DE MEUDON</span><h2>Une promenade en images.</h2><p>Retrouvez aussi les photos de la ville dans notre galerie.</p></div><a class="button outline" href="#/galerie">Découvrir les albums ${icon('arrow-right')}</a></aside><div class="rh-page-note"><p>Comptes référencés depuis <a href="https://www.meudon.fr/" ${externalAttrs()}>le site officiel de la Ville<span class="sr-only"> — nouvel onglet</span></a>. Les publications se consultent directement sur chaque plateforme.</p><a class="text-link" href="#/contact">Une question pour la mairie ? ${icon('arrow-right')}</a></div></section>`;
  };
})();
