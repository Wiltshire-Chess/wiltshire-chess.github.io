(() => {
  'use strict';
  const API = window.WCCA_NEWS_API_URL;
  const GROUPS = [
    { key: 'Current', heading: 'Current competitions' },
    { key: 'Associated', heading: 'Associated competitions' },
    { key: 'Historic', heading: 'Historic competitions' }
  ];
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

  function defaultSection(league) {
    const type = String(league.type || '').toLowerCase();
    if (type === 'external') return 'Associated';
    if (type === 'static') return 'Historic';
    return 'Current';
  }

  function sectionFor(league) {
    const supplied = String(league.section || '').trim().toLowerCase();
    const known = {
      current: 'Current',
      associated: 'Associated',
      historic: 'Historic'
    };
    return known[supplied] || defaultSection(league);
  }

  function sortOrder(league) {
    const raw = league.sortOrder;
    if (raw === null || raw === undefined || String(raw).trim() === '') {
      return Number.POSITIVE_INFINITY;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
  }

  function seasonYear(league) {
    const match = String(league.season || '').match(/(?:19|20)\d{2}/);
    return match ? Number(match[0]) : -1;
  }

  function sortLeagues(first, second) {
    const order = sortOrder(first) - sortOrder(second);
    if (order) return order;
    const season = seasonYear(second) - seasonYear(first);
    if (season) return season;
    return String(first.name || '').localeCompare(String(second.name || ''), 'en', {
      sensitivity: 'base'
    });
  }

  function leagueCard(league) {
    const href = league.type === 'external'
      ? safeUrl(league.dataSource)
      : 'league.html?league=' + encodeURIComponent(league.id || league.name);
    const card = node(href ? 'a' : 'article', 'card league-card league-card-link');
    if (href) card.href = href;

    card.append(node('h3', '', league.name));
    if (league.season) card.append(node('p', 'league-season', league.season));
    if (league.description) card.append(node('p', '', league.description));
    card.append(node('span', 'league-card-action',
      league.type === 'external' ? 'View league website →' : 'View league →'));
    return card;
  }

  function leagueGroup(group, leagues) {
    const section = node('section', 'league-group');
    section.append(node('h2', 'league-group-title', group.heading));
    const cards = node('div', 'league-directory');
    leagues.sort(sortLeagues).forEach(league => cards.append(leagueCard(league)));
    section.append(cards);
    return section;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = document.querySelector('[data-leagues]');
    if (!host) return;
    try {
      if (!API) throw Error('League API is not configured');
      const response = await request({ section: 'leagues' });
      const leagues = response.leagues || [];
      const groups = new Map(GROUPS.map(group => [group.key, []]));
      leagues.forEach(league => {
        const section = sectionFor(league);
        if (groups.has(section)) groups.get(section).push(league);
      });
      const rendered = GROUPS
        .filter(group => groups.get(group.key).length)
        .map(group => leagueGroup(group, groups.get(group.key)));
      host.replaceChildren(...(rendered.length
        ? rendered
        : [node('p', 'league-muted', 'League information will be added here shortly.')]));
    } catch (error) {
      host.replaceChildren(node('p', 'news-error', 'Unable to load league information at present.'));
      console.error(error);
    }
  });
})();
