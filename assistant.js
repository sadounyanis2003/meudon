/* Assistant d’orientation : échange en mémoire, liens issus du répertoire local. */
(() => {
  'use strict';

  const examples = ['Inscrire mon enfant', 'Trouver une association', 'Signaler un problème', 'Les horaires de la mairie'];
  const state = { turns: [], draft: '', busy: false, controller: null, request: 0, speech: null, listening: false, dictationMessage: '', speaking: false, pendingHome: '', voiceOnOpen: false, widgetOpen: false, widgetModal: false, transferToPage: false, widgetFocus: null, inertNodes: new Map() };
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const glyph = name => typeof icon === 'function' ? icon(name) : '';
  const onPage = () => (location.hash.slice(1) || '/').split('?')[0] === '/assistant';
  const activeSurface = () => onPage() || state.widgetOpen;
  const supportedVoice = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function endpoint() {
    try {
      const url = new URL(window.MEUDON_ASSISTANT_CONFIG?.endpoint || '');
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch { return ''; }
  }

  function index() {
    try { return typeof v6SearchIndex === 'function' ? v6SearchIndex() : []; } catch { return []; }
  }

  // Only destinations already present in the local municipal directory can be shown.
  function safeResults(results) {
    const known = index(), seen = new Set();
    return (Array.isArray(results) ? results : []).map(result => {
      if (!result || typeof result !== 'object') return null;
      const item = known.find(entry => result.id && String(entry.id) === String(result.id)) || known.find(entry => (entry.to || entry.url) === result.to);
      if (!item || item.fictional) return null;
      const to = String(item.to || item.url || '');
      const internal = /^#\/[\S]*$/.test(to) && !/[<>"'\\]/.test(to);
      if (!internal) {
        try { const url = new URL(to); if (url.protocol !== 'https:' || url.username || url.password) return null; } catch { return null; }
      }
      if (seen.has(to)) return null;
      seen.add(to);
      return { id: String(item.id || ''), title: String(item.title || ''), description: String(item.desc || item.description || ''), to, type: String(item.searchType || item.category || ''), external: !internal };
    }).filter(Boolean).slice(0, 3);
  }

  function localResults(query) {
    try { return safeResults(MeudonSearch.rank(query, index()).filter(item => !item.fictional)); } catch { return []; }
  }

  function resultCards(results) {
    return results.length ? `<nav class="ma-results" aria-label="Pages proposées">${results.map(item => `<a class="ma-result" href="${escape(item.to)}" ${item.external ? 'target="_blank" rel="noopener noreferrer"' : ''}><span class="ma-result-icon">${glyph(item.external ? 'external' : 'arrow-right')}</span><span><strong>${escape(item.title)}</strong>${item.description ? `<span>${escape(item.description)}</span>` : ''}${item.external ? '<small>Site officiel · nouvel onglet</small>' : ''}</span></a>`).join('')}</nav>` : '';
  }

  function turnMarkup(turn, i) {
    if (turn.role === 'user') return `<article class="ma-turn ma-user"><span class="ma-turn-label">Vous</span><p>${escape(turn.content)}</p></article>`;
    const label = turn.mode === 'search' ? 'Résultats de recherche' : 'Méo · Assistant de Meudon';
    return `<article class="ma-turn ma-answer"><div class="ma-answer-heading"><span class="ma-turn-label">${glyph(turn.mode === 'search' ? 'search' : 'compass')}${label}</span>${turn.mode === 'ai' && window.speechSynthesis ? `<button type="button" class="ma-read" data-assistant-read="${i}" aria-label="Lire la réponse à voix haute">${glyph('book')} Écouter</button>` : ''}</div>${turn.notice ? `<p class="ma-answer-notice">${escape(turn.notice)}</p>` : ''}<p class="ma-answer-text">${escape(turn.content)}</p>${resultCards(turn.results || [])}${turn.mode === 'search' ? `<a class="text-link ma-all-results" href="${escape(typeof v6SearchHref === 'function' ? v6SearchHref(turn.query || '') : '#/recherche?q=' + encodeURIComponent(turn.query || ''))}">Voir tous les résultats ${glyph('arrow-right')}</a>` : ''}${turn.suggestions?.length ? `<div class="ma-followups" aria-label="Préciser votre demande">${turn.suggestions.map(text => `<button type="button" data-assistant-example="${escape(text)}">${escape(text)} ${glyph('arrow-right')}</button>`).join('')}</div>` : ''}</article>`;
  }

  function conversationMarkup() {
    return `${state.turns.map(turnMarkup).join('')}${state.busy ? `<div class="ma-turn ma-answer ma-pending" role="status"><span class="ma-turn-label">${glyph('compass')} Méo · Assistant de Meudon</span><p><span class="ma-wait" aria-hidden="true"></span>Je cherche les bons accès pour vous…</p><button type="button" class="ma-cancel" data-assistant-cancel>Annuler la demande</button></div>` : ''}`;
  }

  function unavailableCopy(code) {
    if (code === 'budget_exhausted') return 'Le quota de démonstration de l’assistant est atteint. La recherche du site reste disponible.';
    if (code === 'rate_limited') return 'L’assistant reçoit trop de demandes. Réessayez dans quelques instants ou utilisez ces résultats de recherche.';
    return 'Assistant temporairement indisponible. Voici les résultats de recherche du site, sans réponse générée par l’IA.';
  }

  function announce(message) {
    const live = document.getElementById('ma-live');
    if (live) live.textContent = message;
  }

  function paint(options = {}) {
    const transcript = document.getElementById('ma-transcript');
    if (!transcript) return;
    transcript.innerHTML = conversationMarkup();
    transcript.setAttribute('aria-busy', String(state.busy));
    const welcome = document.getElementById('ma-welcome');
    if (welcome) welcome.hidden = state.turns.length > 0;
    const clear = document.querySelector('[data-assistant-clear]');
    if (clear) clear.disabled = !state.turns.length && !state.busy && !state.draft;
    const input = document.getElementById('ma-question');
    if (input && input.value !== state.draft) input.value = state.draft;
    const send = document.getElementById('ma-send');
    if (send) { send.disabled = state.busy || state.listening; send.setAttribute('aria-busy', String(state.busy)); }
    const mic = document.querySelector('[data-assistant-mic="page"]');
    if (mic) {
      mic.disabled = state.busy;
      mic.setAttribute('aria-pressed', String(state.listening));
      mic.classList.toggle('is-listening', state.listening);
      mic.innerHTML = `${glyph(state.listening ? 'x' : 'mic')}<span>${state.listening ? 'Terminer la dictée' : 'Dicter ma demande'}</span>`;
    }
    const dictation = document.getElementById('ma-dictation-status');
    if (dictation) dictation.textContent = state.dictationMessage;
    const count = document.getElementById('ma-count');
    if (count) count.textContent = `${state.draft.length} / 600`;
    const stop = document.querySelector('[data-assistant-stop-reading]');
    if (stop) stop.hidden = !state.speaking;
    if (typeof hydrate === 'function') hydrate(transcript);
    if (options.focusAnswer) {
      const last = transcript.querySelector('.ma-turn:last-child');
      if (last) { last.tabIndex = -1; last.focus({ preventScroll: true }); }
      if (last && state.widgetOpen) last.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }
  }

  function stopReading() {
    if (state.speaking && window.speechSynthesis) window.speechSynthesis.cancel();
    state.speaking = false;
    const stop = document.querySelector('[data-assistant-stop-reading]');
    if (stop) stop.hidden = true;
  }

  function stopDictation(abort = false) {
    const speech = state.speech;
    state.speech = null;
    state.listening = false;
    if (speech) { speech.onresult = speech.onerror = speech.onend = null; try { abort ? speech.abort() : speech.stop(); } catch {} }
  }

  function cancelRequest(notify = true) {
    if (!state.busy) return;
    state.request++;
    state.controller?.abort();
    state.controller = null;
    state.busy = false;
    const last = state.turns[state.turns.length - 1];
    if (last?.role === 'user') {
      if (!state.draft) state.draft = last.content;
      state.turns.pop();
    }
    paint();
    if (notify) announce('Demande annulée. Votre texte est conservé dans le champ de saisie.');
  }

  async function send(message) {
    const query = String(message || '').trim().slice(0, 600);
    if (!query || state.busy) { if (!query) document.getElementById('ma-question')?.focus(); return; }
    stopDictation(true); stopReading(); state.dictationMessage = '';
    const history = state.turns.filter(turn => turn.role === 'user' || turn.mode === 'ai').slice(-4).map(turn => ({ role: turn.role, content: turn.content.slice(0, 700) }));
    const token = ++state.request;
    state.turns.push({ role: 'user', content: query });
    if (state.turns.length > 20) state.turns.splice(0, 2);
    state.draft = ''; state.busy = true;
    paint(); announce('Votre demande est en cours.');
    const address = endpoint();
    const controller = new AbortController(); state.controller = controller;
    let timeout = false;
    const timer = setTimeout(() => { timeout = true; controller.abort(); }, 25000);
    try {
      if (!address) throw new Error('unavailable');
      const response = await fetch(address, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: query, history }), signal: controller.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
      const payload = await response.json();
      if (!response.ok || payload.mode !== 'ai' || typeof payload.message !== 'string' || !payload.message.trim()) throw new Error(['budget_exhausted', 'rate_limited', 'invalid_request'].includes(payload.error) ? payload.error : 'unavailable');
      if (token !== state.request || !activeSurface()) return;
      const results = safeResults(payload.results);
      const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions.filter(text => typeof text === 'string' && text.trim()).map(text => text.trim().slice(0, 120)).slice(0, 3) : [];
      const answer = payload.message.trim().slice(0, 2400);
      state.turns.push({ role: 'assistant', mode: 'ai', content: answer, results, suggestions });
      announce(`${answer}${results.length ? ' Pages proposées : ' + results.map(item => item.title).join(', ') + '.' : ''}`);
    } catch (error) {
      if (token !== state.request || !activeSurface()) return;
      if (error.name === 'AbortError' && !timeout) return;
      const results = localResults(query);
      const notice = unavailableCopy(error.message);
      const content = results.length ? 'Ces pages correspondent aux mots de votre demande.' : 'Aucune page ne correspond suffisamment à ces mots. Essayez une démarche, un lieu ou contactez la mairie pour être orienté.';
      state.turns.push({ role: 'assistant', mode: 'search', content, notice, results, query });
      announce(`${notice} ${content}${results.length ? ' ' + results.map(item => item.title).join(', ') : ''}`);
    } finally {
      clearTimeout(timer);
      if (token === state.request) { state.busy = false; state.controller = null; paint({ focusAnswer: true }); }
    }
  }

  function startDictation() {
    if (state.busy) return;
    if (state.listening) {
      // Keep the final recognition event so the end of the sentence can arrive.
      try { state.speech?.stop(); } catch { stopDictation(true); }
      return;
    }
    if (!supportedVoice()) {
      state.dictationMessage = 'La dictée n’est pas disponible dans ce navigateur. Vous pouvez écrire votre demande dans le champ ci-dessus.';
      paint(); announce(state.dictationMessage); return;
    }
    stopReading();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const speech = new Recognition();
    const initial = state.draft.trim();
    let finalText = '';
    state.speech = speech; state.listening = true;
    state.dictationMessage = 'À votre écoute… Dictez votre demande, puis relisez-la avant de l’envoyer.';
    speech.lang = 'fr-FR'; speech.interimResults = true; speech.continuous = false; speech.maxAlternatives = 1;
    speech.onresult = event => {
      if (state.speech !== speech || !activeSurface()) return;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript + ' ';
        else interim += event.results[i][0].transcript + ' ';
      }
      state.draft = [initial, finalText.trim(), interim.trim()].filter(Boolean).join(' ').slice(0, 600);
      paint();
    };
    speech.onerror = event => {
      if (state.speech !== speech) return;
      const denied = event.error === 'not-allowed' || event.error === 'service-not-allowed';
      state.dictationMessage = denied ? 'Le microphone n’est pas autorisé. Vous pouvez écrire votre demande ou modifier l’autorisation dans les réglages du navigateur.' : event.error === 'no-speech' ? 'Aucune voix détectée. Vous pouvez réessayer ou écrire votre demande.' : 'La dictée est indisponible. Votre texte reste modifiable au clavier.';
      stopDictation(true); paint(); announce(state.dictationMessage);
    };
    speech.onend = () => {
      if (state.speech !== speech) return;
      state.speech = null; state.listening = false;
      state.dictationMessage = state.draft ? 'Dictée terminée. Relisez votre demande, puis choisissez « Envoyer ».' : 'Dictée terminée. Vous pouvez réessayer ou écrire votre demande.';
      paint(); announce(state.dictationMessage);
    };
    paint(); announce(state.dictationMessage);
    try { speech.start(); } catch {
      stopDictation(true); state.dictationMessage = 'Le microphone est indisponible. Vous pouvez écrire votre demande.'; paint(); announce(state.dictationMessage);
    }
  }

  function navigateToAssistant() {
    if (window.MeudonV6?.navigate) window.MeudonV6.navigate('#/assistant');
    else location.hash = '#/assistant';
  }

  window.homeAssistantBlock = function homeAssistantBlock() {
    return `<section class="wrap ma-home" aria-labelledby="ma-home-title"><div class="ma-home-inner"><div class="ma-home-copy"><span class="ma-badge">${glyph('compass')} ASSISTANT IA · PROTOTYPE</span><h2 id="ma-home-title">Une question ?<br><em>Méo vous guide.</em></h2><p>Décrivez ce que vous cherchez. Méo vous propose les bonnes pages et les accès utiles.</p><a class="ma-home-how" href="#/assistant">Découvrir Méo ${glyph('arrow-right')}</a></div><div class="ma-home-entry"><form data-assistant-home><label for="ma-home-question">Que souhaitez-vous faire à Meudon ?</label><div class="ma-home-field"><input id="ma-home-question" name="question" maxlength="600" placeholder="Ex. : inscrire mon enfant à une activité" autocomplete="off" required><button type="submit" aria-label="Envoyer ma demande à Méo">${glyph('arrow-right')}</button></div><p class="ma-home-privacy">Votre demande est transmise au service d’IA. N’indiquez aucune donnée personnelle.</p></form><div class="ma-home-bottom"><button type="button" data-assistant-mic="home">${glyph('mic')} Dicter ma demande</button><a href="#/assistant">Écrire à Méo ${glyph('arrow-up-right')}</a></div><p class="ma-home-voice-note">Dictée par le service vocal de votre navigateur · transcription à relire avant envoi.</p><div class="ma-home-examples" aria-label="Exemples de demandes">${examples.slice(0, 3).map(text => `<button type="button" data-assistant-open-example="${escape(text)}">${escape(text)}</button>`).join('')}</div></div></div></section>`;
  };

  function workspaceMarkup(compact = false) {
    const noConnection = !endpoint();
    return `<div class="ma-workspace${compact ? ' ma-compact' : ''}"><div class="ma-workspace-heading"><span>${glyph('compass')} Votre échange</span><button type="button" data-assistant-clear ${state.turns.length || state.draft ? '' : 'disabled'}>${glyph('plus')} Nouvel échange</button></div>${noConnection ? '<div class="ma-connection-note">Assistant temporairement indisponible. Vous pouvez utiliser ce champ pour rechercher dans les pages du site.</div>' : ''}<div class="ma-message-area"><div id="ma-welcome" class="ma-welcome" ${state.turns.length ? 'hidden' : ''}><span class="ma-welcome-symbol" aria-hidden="true">${glyph('compass')}</span><h2>Bonjour, je suis Méo.</h2><p>Décrivez votre besoin en une phrase. Je vous propose les pages utiles et vous aide à préciser votre demande.</p>${compact ? `<div class="ma-widget-examples" aria-label="Exemples de demandes">${examples.slice(0, 3).map(text => `<button type="button" data-assistant-example="${escape(text)}">${escape(text)} ${glyph('arrow-right')}</button>`).join('')}</div>` : ''}</div><div id="ma-transcript" class="ma-transcript" aria-label="Votre échange avec Méo" aria-busy="${state.busy}">${conversationMarkup()}</div><p id="ma-live" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p></div><button type="button" class="ma-stop-reading" data-assistant-stop-reading hidden>${glyph('x')} Arrêter la lecture</button><form class="ma-composer" data-assistant-form><label for="ma-question">Votre demande</label><textarea id="ma-question" name="question" rows="${compact ? 2 : 3}" maxlength="600" placeholder="Ex. : je cherche une activité sportive pour mon enfant" aria-describedby="ma-privacy ma-keyboard-tip" required>${escape(state.draft)}</textarea><p id="ma-privacy" class="ma-privacy">Votre demande est transmise au service d’IA. N’indiquez aucune donnée personnelle.</p><div class="ma-composer-actions"><button type="button" class="ma-mic" data-assistant-mic="page" aria-pressed="false">${glyph('mic')}<span>Dicter ma demande</span></button><span id="ma-count" class="ma-count" aria-hidden="true">${state.draft.length} / 600</span><button id="ma-send" type="submit" class="button primary">Envoyer ${glyph('arrow-right')}</button></div><p id="ma-dictation-status" class="ma-dictation-status" role="status" aria-live="polite">${escape(state.dictationMessage)}</p><p id="ma-keyboard-tip" class="ma-keyboard-tip">Entrée pour envoyer · Maj + Entrée pour revenir à la ligne</p></form><details class="ma-explanation"><summary>À savoir avant de commencer ${glyph('chevron')}</summary><div><p>Méo oriente vers les contenus référencés dans cette maquette. Il peut se tromper : les services officiels confirment les horaires, tarifs et conditions. Les événements de démonstration ne constituent pas une programmation réelle.</p><p>Les derniers messages de cet échange sont transmis au service d’IA pour comprendre vos précisions. L’échange n’est pas enregistré par le site et disparaît au rechargement de la page. « Nouvel échange » efface les messages affichés.</p><p>La dictée utilise le service vocal de votre navigateur, qui peut traiter l’audio auprès de son fournisseur. Le microphone ne s’active qu’à votre demande. Relisez la transcription avant de l’envoyer.</p><a href="#/recherche" class="text-link">Utiliser la recherche du site ${glyph('arrow-right')}</a></div></details></div>`;
  }

  function restoreBackground() {
    state.inertNodes.forEach((previous, node) => { if (node.isConnected) node.inert = previous; });
    state.inertNodes.clear();
  }

  function syncWidgetModal() {
    const panel = document.getElementById('meo-panel');
    if (!panel || !state.widgetOpen) return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    restoreBackground();
    state.widgetModal = mobile;
    panel.setAttribute('aria-modal', String(mobile));
    document.getElementById('meo-backdrop').hidden = !mobile;
    if (mobile) {
      for (const node of document.body.children) {
        if (node.id === 'meo-widget' || ['SCRIPT', 'STYLE'].includes(node.tagName)) continue;
        state.inertNodes.set(node, !!node.inert);
        node.inert = true;
      }
    }
  }

  function ensureWidget() {
    let root = document.getElementById('meo-widget');
    if (!root) {
      root = document.createElement('div');
      root.id = 'meo-widget';
      root.className = 'ma-widget';
      root.innerHTML = `<button type="button" id="meo-backdrop" class="ma-widget-backdrop" data-assistant-widget-close tabindex="-1" aria-label="Fermer Méo" hidden></button><section id="meo-panel" class="ma-widget-panel" role="dialog" aria-labelledby="meo-panel-title" aria-modal="false" hidden></section><button type="button" id="meo-launcher" class="ma-launcher" data-assistant-widget-toggle aria-label="Parler à Méo" aria-haspopup="dialog" aria-controls="meo-panel" aria-expanded="false"><span class="ma-launcher-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M20.5 11.1a8.6 8.6 0 0 1-8.8 8.4 9.6 9.6 0 0 1-3.4-.6L3 21l1.5-5.3a8 8 0 0 1-1.4-4.6 8.6 8.6 0 0 1 8.6-8.5 8.7 8.7 0 0 1 8.8 8.5Z"/><path d="M7.8 13.8V8.5l3.9 3.3 3.9-3.3v5.3"/></svg></span><span class="ma-launcher-copy"><strong>Méo</strong><small>Une question ?</small></span></button>`;
      document.body.appendChild(root);
    }
    root.hidden = onPage();
    return root;
  }

  function openWidget(trigger) {
    if (onPage()) { document.getElementById('ma-question')?.focus(); return; }
    if (state.widgetOpen) return;
    const root = ensureWidget();
    state.widgetFocus = trigger || document.activeElement;
    state.widgetOpen = true;
    const panel = document.getElementById('meo-panel');
    panel.innerHTML = `<header class="ma-widget-header"><div class="ma-widget-identity"><span class="ma-widget-monogram" aria-hidden="true">m.</span><div><h2 id="meo-panel-title" tabindex="-1">Méo</h2><p>L’assistant de Meudon</p><span>ASSISTANT IA · PROTOTYPE</span></div></div><div class="ma-widget-tools"><a href="#/assistant" class="ma-widget-expand" aria-label="Ouvrir Méo en grand">${glyph('external')}<span>Ouvrir en grand</span></a><button type="button" data-assistant-widget-close class="ma-widget-close" aria-label="Fermer Méo">${glyph('x')}</button></div></header><div class="ma-widget-body">${workspaceMarkup(true)}</div>`;
    panel.hidden = false;
    root.classList.add('is-open');
    document.getElementById('meo-launcher').setAttribute('aria-expanded', 'true');
    document.getElementById('meo-launcher').setAttribute('aria-label', 'Fermer Méo');
    document.body.classList.add('meo-widget-open');
    syncWidgetModal();
    paint();
    document.getElementById('meo-panel-title').focus({ preventScroll: true });
  }

  function closeWidget(options = {}) {
    if (!state.widgetOpen) return;
    const { returnFocus = true, keepRequest = false } = options;
    if (!keepRequest) cancelRequest(false);
    stopDictation(true); stopReading(); state.dictationMessage = '';
    state.widgetOpen = false; state.widgetModal = false;
    restoreBackground();
    document.body.classList.remove('meo-widget-open');
    const root = document.getElementById('meo-widget');
    root?.classList.remove('is-open');
    const panel = document.getElementById('meo-panel');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    const backdrop = document.getElementById('meo-backdrop');
    if (backdrop) backdrop.hidden = true;
    const launcher = document.getElementById('meo-launcher');
    launcher?.setAttribute('aria-expanded', 'false');
    launcher?.setAttribute('aria-label', 'Parler à Méo');
    if (returnFocus) {
      const target = state.widgetFocus?.isConnected && !state.widgetFocus.inert ? state.widgetFocus : launcher;
      target?.focus({ preventScroll: true });
    }
    state.widgetFocus = null;
  }

  window.meudonAssistantView = function meudonAssistantView() {
    if (state.widgetOpen) { state.transferToPage = true; closeWidget({ returnFocus: false, keepRequest: true }); }
    return `${pageTop('Méo · L’assistant de Meudon', 'Une question ?<br>Méo vous guide.', 'Écrivez ou dictez votre besoin. Méo vous aide à trouver les bonnes pages du site et les services officiels.')}<section class="wrap page-content ma-page" aria-label="Assistant d’orientation"><aside class="ma-sidebar"><span class="ma-badge">${glyph('compass')} ASSISTANT IA · PROTOTYPE</span><h2>Partons de<br>votre besoin.</h2><p>Une démarche, une activité, un lieu : dites-le avec vos mots.</p><div class="ma-examples"><span class="eyebrow">POUR COMMENCER</span>${examples.map(text => `<button type="button" data-assistant-example="${escape(text)}">${escape(text)} ${glyph('arrow-right')}</button>`).join('')}</div><div class="ma-human"><span>${glyph('phone')}</span><p>Vous préférez un interlocuteur ?<a href="#/contact">Contacter la mairie ${glyph('arrow-right')}</a></p></div></aside>${workspaceMarkup()}</section>`;
  };

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-assistant-form], [data-assistant-home]');
    if (!form) return;
    event.preventDefault();
    const value = String(new FormData(form).get('question') || '').trim().slice(0, 600);
    if (form.hasAttribute('data-assistant-home')) {
      if (!value) return;
      state.pendingHome = value;
      navigateToAssistant();
    } else send(value);
  });

  document.addEventListener('input', event => {
    if (event.target.id !== 'ma-question') return;
    state.draft = event.target.value.slice(0, 600);
    const count = document.getElementById('ma-count'); if (count) count.textContent = `${state.draft.length} / 600`;
    const clear = document.querySelector('[data-assistant-clear]'); if (clear) clear.disabled = !state.turns.length && !state.busy && !state.draft;
  });

  document.addEventListener('keydown', event => {
    if (event.target.id !== 'ma-question' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!state.listening) send(event.target.value);
  });

  document.addEventListener('keydown', event => {
    if (!state.widgetOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeWidget(); return; }
    if (event.key !== 'Tab' || !state.widgetModal) return;
    const panel = document.getElementById('meo-panel');
    const controls = [...panel.querySelectorAll('button:not(:disabled), a[href], textarea, summary')].filter(node => !node.closest('[hidden]') && !(node.closest('details:not([open])') && node.tagName !== 'SUMMARY'));
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-assistant-widget-toggle], [data-assistant-widget-close]');
    if (!button) return;
    if (button.hasAttribute('data-assistant-widget-close') || state.widgetOpen) closeWidget();
    else openWidget(button);
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('#meo-panel a[href^="#/"]');
    if (!link || link.getAttribute('href') === '#/assistant' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
    const samePage = link.getAttribute('href') === location.hash;
    closeWidget({ returnFocus: false });
    if (samePage) document.getElementById('main')?.focus({ preventScroll: true });
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-assistant-example], [data-assistant-open-example], [data-assistant-mic], [data-assistant-clear], [data-assistant-cancel], [data-assistant-read], [data-assistant-stop-reading]');
    if (!button) return;
    if (button.hasAttribute('data-assistant-example')) {
      state.draft = button.dataset.assistantExample.slice(0, 600); paint(); document.getElementById('ma-question')?.focus();
    } else if (button.hasAttribute('data-assistant-open-example')) {
      state.draft = button.dataset.assistantOpenExample.slice(0, 600); navigateToAssistant();
    } else if (button.hasAttribute('data-assistant-mic')) {
      if (button.dataset.assistantMic === 'home') { state.draft = (document.getElementById('ma-home-question')?.value || state.draft).slice(0, 600); state.voiceOnOpen = true; navigateToAssistant(); }
      else startDictation();
    } else if (button.hasAttribute('data-assistant-clear')) {
      cancelRequest(false); stopDictation(true); stopReading(); state.turns = []; state.draft = ''; state.dictationMessage = ''; paint(); announce('Nouvel échange. Les messages précédents ont été effacés.'); document.getElementById('ma-question')?.focus();
    } else if (button.hasAttribute('data-assistant-cancel')) { cancelRequest(); document.getElementById('ma-question')?.focus(); }
    else if (button.hasAttribute('data-assistant-stop-reading')) { stopReading(); announce('Lecture arrêtée.'); }
    else if (button.hasAttribute('data-assistant-read') && window.speechSynthesis) {
      const turn = state.turns[Number(button.dataset.assistantRead)];
      if (!turn || turn.mode !== 'ai') return;
      stopReading();
      const utterance = new SpeechSynthesisUtterance(turn.content);
      utterance.lang = 'fr-FR'; utterance.rate = 1;
      utterance.onend = utterance.onerror = () => { state.speaking = false; const stop = document.querySelector('[data-assistant-stop-reading]'); if (stop) stop.hidden = true; };
      state.speaking = true; window.speechSynthesis.speak(utterance);
      const stop = document.querySelector('[data-assistant-stop-reading]'); if (stop) stop.hidden = false;
    }
  });

  document.addEventListener('meudon:route', () => {
    const transfer = state.transferToPage; state.transferToPage = false;
    if (!transfer) cancelRequest(false);
    stopDictation(true); stopReading();
    if (state.widgetOpen) closeWidget({ returnFocus: false });
    ensureWidget();
    if (!onPage()) { state.voiceOnOpen = false; return; }
    paint();
    if (state.pendingHome) { const query = state.pendingHome; state.pendingHome = ''; send(query); }
    if (state.voiceOnOpen) { state.voiceOnOpen = false; startDictation(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopDictation(true); stopReading(); state.dictationMessage = ''; paint(); } });
  const widgetMedia = window.matchMedia('(max-width: 760px)');
  widgetMedia.addEventListener('change', syncWidgetModal);
  window.addEventListener('pagehide', () => { cancelRequest(false); stopDictation(true); stopReading(); closeWidget({ returnFocus: false }); });
})();
