(() => {
  'use strict';
  const API = window.WCCA_NEWS_API_URL;
  let sequence = 0;

  function request(params) {
    return new Promise((resolve, reject) => {
      const callback = 'wccaLeagueDirectory' + (++sequence);
      const script = document.createElement('script');
      const url = new URL(API);
      url.searchParams.set('callback', callback);
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      const timeout = setTimeout(cleanup, 20000);
      function cleanup() {
        clearTimeout(timeout);
        delete window[callback];
        script.remove();
      }
      window[callback] = data => {
        cleanup();
        data && data.ok ? resolve(data) : reject(Error(data && data.error || 'League API error'));
      };
      script.onerror = () => {
        cleanup();
        reject(Error('League API unavailable'));
      };
      script.src = url;
      document.head.append(script);
    });
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  function leagueCard(league) {
    const href = league.type === 'external'
      ? safeUrl(league.dataSource)
      : 'league.html?league=' + encodeURIComponent(league.name);
    const card = node(href ? 'a' : 'article', 'card league-card league-card-link');
    if (href) card.href = href;

    card.append(node('h2', '', league.name));
    if (league.description) card.append(node('p', '', league.description));
    card.append(node('span', 'league-card-action',
      league.type === 'external' ? 'View league website →' : 'View league →'));
    return card;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = document.querySelector('[data-leagues]');
    if (!host) return;
    try {
      if (!API) throw Error('League API is not configured');
      const response = await request({ section: 'leagues' });
      const leagues = response.leagues || [];
      host.replaceChildren(...(leagues.length
        ? leagues.map(leagueCard)
        : [node('p', 'league-muted', 'League information will be added here shortly.')]));
    } catch (error) {
      host.replaceChildren(node('p', 'news-error', 'Unable to load league information at present.'));
      console.error(error);
    }
  });
})();