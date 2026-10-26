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

  function standingsTable(rows, onTeamSelected) {
    const wrap = node('div', 'league-table-wrap');
    const table = node('table', 'league-table');
    const head = node('thead');
    const header = node('tr');
    [['#', 'Position'], ['Team'], ['P', 'Played'], ['W', 'Won'], ['D', 'Drawn'], ['L', 'Lost'], ['GF', 'Game points for'], ['GA', 'Game points against'], ['Pen', 'Penalty points'], ['Pts', 'Match points after deductions']]
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
      const position = node('td', '', row.position);
      if (row.tieBreak) {
        const note = node('button', 'table-note', '*');
        note.type = 'button';
        note.title = row.tieBreak;
        note.setAttribute('aria-label', row.tieBreak);
        note.addEventListener('click', () => window.alert(row.tieBreak));
        position.append(note);
      }
      line.append(position);
      const team = node('td');
      const teamButton = node('button', 'team-filter-button', row.team);
      teamButton.type = 'button';
      teamButton.title = 'Show only ' + row.team + ' results';
      teamButton.setAttribute('aria-label', 'Show only ' + row.team + ' results');
      teamButton.addEventListener('click', () => onTeamSelected(row.team));
      team.append(teamButton);
      line.append(team);
      [row.played, row.won, row.drawn, row.lost, row.gamesFor, row.gamesAgainst, row.penaltyPoints]
        .forEach(value => line.append(node('td', '', value)));
      const points = node('td', '', row.points);
      if (row.pointDeduction > 0) {
        const note = node('button', 'table-note', '*');
        const message = row.pointDeduction + ' match point' + (row.pointDeduction === 1 ? '' : 's') +
          ' deducted for ' + row.penaltyPoints + ' penalty points.';
        note.type = 'button';
        note.title = message;
        note.setAttribute('aria-label', message);
        note.addEventListener('click', () => window.alert(message));
        points.append(note);
      }
      line.append(points);
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

  function playerCell(name, colour) {
    const cell = node('td');
    const player = String(name || '').trim();
    if (!player) {
      cell.textContent = '—';
      return cell;
    }
    if (colour) {
      const badge = node('span', 'piece-colour piece-' + colour.toLowerCase());
      badge.setAttribute('aria-hidden', 'true');
      cell.setAttribute('aria-label', player + ', ' + colour);
      cell.append(badge);
    }
    cell.append(document.createTextNode(player));
    return cell;
  }

  function homeColour(board) {
    const digits = String(board || '').trim().match(/^S?(\d+)$/i);
    if (!digits) return '';
    return Number(digits[1]) % 2 ? 'Black' : 'White';
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
        const homeColourName = homeColour(board.board);
        const awayColourName = homeColourName === 'Black' ? 'White' :
          homeColourName === 'White' ? 'Black' : '';
        row.append(
          node('td', '', board.board),
          playerCell(board.homePlayer, homeColourName),
          playerCell(board.awayPlayer, awayColourName),
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

    let selectedTeam = '';
    const matches = league.matches || [];

    host.append(node('h2', 'league-subheading', 'League table'));
    host.append((league.standings || []).length
      ? standingsTable(league.standings, selectTeam)
      : node('p', 'league-muted', 'The table will appear after the first official result is entered.'));

    const resultsSection = node('section', 'league-results');
    const resultsHeading = node('h2', 'league-subheading', 'Results');
    const resultsNotice = node('p', 'league-results-notice');
    resultsNotice.setAttribute('role', 'status');
    const resultsList = node('div');
    resultsSection.append(resultsHeading, resultsNotice, resultsList);
    host.append(resultsSection);

    function teamAppearsIn(match, team) {
      return match.home === team || match.away === team;
    }

    function updateResults() {
      const visibleMatches = selectedTeam
        ? matches.filter(match => teamAppearsIn(match, selectedTeam))
        : matches;
      resultsHeading.textContent = selectedTeam
        ? 'Results for ' + selectedTeam
        : 'Results';
      resultsNotice.replaceChildren();
      if (selectedTeam) {
        resultsNotice.append(
          document.createTextNode('Showing only matches involving ' + selectedTeam + '. '),
          (() => {
            const clear = node('button', 'clear-team-filter', 'Clear filter');
            clear.type = 'button';
            clear.addEventListener('click', () => {
              selectedTeam = '';
              updateResults();
            });
            return clear;
          })()
        );
      } else if (matches.length && (league.standings || []).length) {
        resultsNotice.textContent = 'Select a team in the league table to show only its matches.';
      }
      resultsList.replaceChildren(matchList(visibleMatches));
    }

    function selectTeam(team) {
      selectedTeam = team;
      updateResults();
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    updateResults();
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
      const debug = new URLSearchParams(location.search).get('debug') === '1';
      const message = debug
        ? 'Unable to load this league: ' + (error && error.message || 'Unknown error')
        : 'Unable to load this league at present.';
      host.replaceChildren(node('p', 'news-error', message));
      console.error(error);
    }
  });
})();