(() => {
  'use strict';
  const API = window.WCCA_NEWS_API_URL;
  let sequence = 0;

  function request(params) {
    return new Promise((resolve, reject) => {
      const callback = 'wccaLeagueDetail' + (++sequence);
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

  function formatDate(value) {
    const parts = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) return value || '';
    return new Date(+parts[3], +parts[2] - 1, +parts[1])
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function informationBox(league) {
    const documents = (league.documents || [])
      .map(document => ({ label: document.label, href: safeUrl(document.url) }))
      .filter(document => document.href);
    if (!league.description && !documents.length) return null;

    const box = node('section', 'league-info');
    box.append(node('h2', '', 'League information'));
    if (league.description) box.append(node('p', '', league.description));
    if (documents.length) {
      const links = node('div', 'league-document-links');
      documents.forEach(document => {
        const link = node('a', 'league-document-link', document.label);
        link.href = document.href;
        links.append(link);
      });
      box.append(links);
    }
    return box;
  }

  function standingsTable(rows) {
    const wrap = node('div', 'league-table-wrap');
    const table = node('table', 'league-table');
    const head = node('thead');
    const header = node('tr');
    [['#', 'Position'], ['Team'], ['P', 'Played'], ['W', 'Won'], ['D', 'Drawn'], ['L', 'Lost'], ['GF', 'Games for'], ['GA', 'Games against'], ['Pts', 'League points']]
      .forEach(([label, title]) => {
        const cell = node('th', '', label);
        cell.title = title;
        header.append(cell);
      });
    head.append(header);
    table.append(head);
    const body = node('tbody');
    rows.forEach(row => {
      const line = node('tr');
      [row.position, row.team, row.played, row.won, row.drawn, row.lost, row.gamesFor, row.gamesAgainst, row.points]
        .forEach(value => line.append(node('td', '', value)));
      body.append(line);
    });
    table.append(body);
    wrap.append(table);
    return wrap;
  }

  function staticTable(table) {
    if (!table || !table.headings || !table.headings.length) {
      return node('p', 'league-muted', 'No table has been entered yet.');
    }
    const wrap = node('div', 'league-table-wrap');
    const rendered = node('table', 'league-table');
    const head = node('thead');
    const header = node('tr');
    table.headings.forEach(value => header.append(node('th', '', value)));
    head.append(header);
    rendered.append(head);
    const body = node('tbody');
    (table.rows || []).forEach(values => {
      const row = node('tr');
      values.forEach(value => row.append(node('td', '', value)));
      body.append(row);
    });
    rendered.append(body);
    wrap.append(rendered);
    return wrap;
  }

  function matchList(matches) {
    const list = node('div', 'league-matches');
    if (!matches.length) {
      list.append(node('p', 'league-muted', 'No match results have been entered yet.'));
      return list;
    }
    matches.forEach(match => {
      const details = node('details', 'league-match');
      const summary = node('summary');
      summary.append(
        node('time', '', formatDate(match.date)),
        node('strong', '', match.home + ' ' + match.score + ' ' + match.away),
        node('span', 'league-result', match.result)
      );
      details.append(summary);

      const table = node('table', 'board-table');
      const head = node('thead');
      const header = node('tr');
      ['Board', 'Home player', 'Away player', 'Result', ''].forEach(value => header.append(node('th', '', value)));
      head.append(header);
      table.append(head);

      const body = node('tbody');
      match.boards.forEach(board => {
        const row = node('tr', board.spare ? 'spare-board' : '');
        row.append(
          node('td', '', board.board),
          node('td', '', board.homePlayer || '—'),
          node('td', '', board.awayPlayer || '—'),
          node('td', '', board.result || '—'),
          node('td', 'spare-label', board.spare ? 'Spare — not counted' : '')
        );
        body.append(row);
      });
      table.append(body);
      details.append(table);
      list.append(details);
    });
    return list;
  }

  function render(host, league) {
    document.title = league.name + ' | Wiltshire Chess';
    const title = document.querySelector('[data-league-title]');
    const intro = document.querySelector('[data-league-intro]');
    if (title) title.textContent = league.name;
    if (intro) intro.textContent = league.description || 'League information, results and standings.';
    host.replaceChildren();

    const back = node('a', 'back-link', '← All leagues');
    back.href = 'leagues.html';
    host.append(back);

    const info = informationBox(league);
    if (info) host.append(info);

    if (league.type === 'external') {
      const href = safeUrl(league.externalUrl);
      if (href) {
        const link = node('a', 'button', 'Visit league website →');
        link.href = href;
        host.append(link);
      }
      return;
    }

    if (league.type === 'static') {
      host.append(node('h2', 'league-subheading', 'Table'));
      host.append(staticTable(league.table));
      return;
    }

    host.append(node('h2', 'league-subheading', 'League table'));
    host.append((league.standings || []).length
      ? standingsTable(league.standings)
      : node('p', 'league-muted', 'The table will appear after the first official result is entered.'));
    host.append(node('h2', 'league-subheading', 'Results'));
    host.append(matchList(league.matches || []));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = document.querySelector('[data-league]');
    const name = new URLSearchParams(location.search).get('league');
    if (!host) return;
    if (!name) {
      host.replaceChildren(node('p', 'news-error', 'No league was specified.'));
      return;
    }
    try {
      if (!API) throw Error('League API is not configured');
      const response = await request({ section: 'league', name });
      render(host, response.league);
    } catch (error) {
      host.replaceChildren(node('p', 'news-error', 'Unable to load this league at present.'));
      console.error(error);
    }
  });
})();