(() => {
  'use strict';
  const API = window.WCCA_NEWS_API_URL;
  let sequence = 0;

  function request(params) {
    return new Promise((resolve, reject) => {
      const callback = 'wccaLeagueCb' + (++sequence);
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

  function formatDate(value) {
    const parts = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!parts) return value || '';
    return new Date(+parts[3], +parts[2] - 1, +parts[1])
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function standingsTable(rows) {
    const wrap = node('div', 'league-table-wrap');
    const table = node('table', 'league-table');
    const head = node('thead');
    const tr = node('tr');
    [['#', 'Position'], ['Team'], ['P', 'Played'], ['W', 'Won'], ['D', 'Drawn'], ['L', 'Lost'], ['GP', 'Game points'], ['MP', 'Match points']]
      .forEach(([label, title]) => {
        const th = node('th', '', label);
        th.title = title;
        tr.append(th);
      });
    head.append(tr);
    table.append(head);

    const body = node('tbody');
    rows.forEach(row => {
      const line = node('tr');
      [row.position, row.team, row.played, row.won, row.drawn, row.lost, row.gamePoints, row.matchPoints]
        .forEach(value => line.append(node('td', '', value)));
      body.append(line);
    });
    table.append(body);
    wrap.append(table);
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

  function renderDetails(target, league) {
    target.replaceChildren();
    if (league.description) target.append(node('p', 'league-description', league.description));

    if (league.type === 'external') {
      const link = node('a', 'button', 'View ' + league.name + ' results →');
      link.href = league.externalUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      target.append(link);
      return;
    }

    if (league.documents && league.documents.length) {
      const docs = node('p', 'league-documents');
      league.documents.forEach((doc, index) => {
        if (index) docs.append(document.createTextNode(' · '));
        const link = node('a', '', doc.label);
        link.href = doc.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        docs.append(link);
      });
      target.append(docs);
    }

    if (league.type === 'static') {
      target.append(staticTable(league.table));
      return;
    }

    target.append(node('h2', 'league-subheading', 'League table'));
    target.append((league.standings || []).length
      ? standingsTable(league.standings)
      : node('p', 'league-muted', 'The table will appear after the first official result is entered.'));

    target.append(node('h2', 'league-subheading', 'Results'));
    target.append(matchList(league.matches || []));
  }

  function leagueCard(entry) {
    const card = node('article', 'card league-card');
    card.append(node('h2', '', entry.name));
    const kind = node('p', 'league-type', entry.type === 'live' ? 'Wiltshire live league' :
      entry.type === 'static' ? 'Table and archive' : 'External league');
    card.append(kind);
    if (entry.description) card.append(node('p', '', entry.description));

    const button = node('button', 'league-open', entry.type === 'external' ? 'View link' : 'View league');
    button.type = 'button';
    const detail = node('div', 'league-detail');
    detail.hidden = true;

    button.addEventListener('click', async () => {
      if (!detail.hidden) {
        detail.hidden = true;
        button.textContent = entry.type === 'external' ? 'View link' : 'View league';
        return;
      }
      detail.hidden = false;
      detail.replaceChildren(node('p', 'league-muted', 'Loading…'));
      button.disabled = true;
      try {
        const response = await request({ section: 'league', name: entry.name });
        renderDetails(detail, response.league);
        button.textContent = 'Hide league';
      } catch (error) {
        detail.replaceChildren(node('p', 'news-error', 'Unable to load this league at present.'));
        console.error(error);
      } finally {
        button.disabled = false;
      }
    });

    card.append(button, detail);
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