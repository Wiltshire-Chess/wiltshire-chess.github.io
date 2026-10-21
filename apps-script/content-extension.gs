/**
 * Wiltshire Chess API: spreadsheet content extensions.
 *
 * This is the companion to Code.gs.  It supplies content from the spreadsheet
 * to the GitHub Pages website.  Run setupLeaguesV1 once after saving this file.
 */
const WCCA_CONTENT_SHEET_ID_ = '1RrAlAiASvgZA22cYCH53WD-ThNx-F4PJzNViwEVdSRc';

function wccaSheetRows_(tab) {
  const sheet = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_).getSheetByName(tab);
  if (!sheet) throw Error('Missing sheet: ' + tab);
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return [];
  const keys = values.shift().map(x => x.trim().toLowerCase());
  return values.filter(row => row.some(x => String(x).trim())).map(row => {
    const out = {};
    keys.forEach((key, i) => { if (key) out[key] = row[i] || ''; });
    return out;
  });
}

function wccaSettings_() {
  const result = {};
  wccaSheetRows_('Settings').forEach(row => {
    if (row.setting) result[row.setting] = row.value;
  });
  return result;
}

function doGet(e) {
  if (e && e.parameter && e.parameter.section) return wccaSectionResponse_(e);
  return wccaOriginalDoGet(e);
}

function wccaSectionResponse_(e) {
  const section = String(e.parameter.section || '').toLowerCase();
  const callback = String(e.parameter.callback || '');
  if (!/^[a-zA-Z_$][\w$]*$/.test(callback)) throw Error('Invalid JSONP callback');

  let payload;
  try {
    if (section === 'settings') {
      payload = { ok: true, settings: wccaSettings_() };
    } else if (section === 'clubs') {
      payload = {
        ok: true,
        clubs: wccaSheetRows_('Clubs').map(r => ({
          club: r.club,
          location: r.location,
          webPage: r['web page']
        })).filter(r => r.club)
      };
    } else if (section === 'committee') {
      payload = {
        ok: true,
        committee: wccaSheetRows_('Committee').map(r => ({
          section: r.section,
          role: r.role,
          value: r.value,
          extraText: r['extra text']
        })).filter(r => r.role || r.value)
      };
    } else if (section === 'pages') {
      payload = {
        ok: true,
        pages: wccaSheetRows_('Pages').map(r => ({
          id: r['page id'],
          navigationLabel: r['navigation label'],
          eyebrow: r.eyebrow,
          title: r.title,
          introduction: r.introduction,
          mainText: r['main text']
        })).filter(r => /^[a-z0-9-]+$/.test(r.id || ''))
      };
    } else if (section === 'leagues') {
      // Directory only: individual results are fetched only after a visitor
      // opens one league, keeping the landing page quick.
      payload = { ok: true, leagues: wccaLeagueDirectory_() };
    } else if (section === 'league') {
      payload = { ok: true, league: wccaLeague_(e.parameter.name || '') };
    } else {
      payload = { ok: false, error: 'Unknown section' };
    }
  } catch (err) {
    payload = { ok: false, error: String(err.message || err) };
  }

  return ContentService.createTextOutput(callback + '(' + JSON.stringify(payload) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ---------- League directory ---------- */

function wccaLeagueDirectory_() {
  const book = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_);
  const sheet = book.getSheetByName('Leagues');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getDisplayValues();
  const headings = values.shift().map(wccaKey_);
  const value = (row, ...names) => {
    for (const name of names) {
      const i = headings.indexOf(wccaKey_(name));
      if (i >= 0 && row[i]) return String(row[i]).trim();
    }
    return '';
  };

  return values.map(row => ({
    name: value(row, 'League name', 'League', 'Name'),
    type: value(row, 'Type of league', 'Type').toLowerCase(),
    dataSource: value(row, 'Place for the data', 'Data source', 'Source', 'Tab name', 'URL'),
    description: value(row, 'Description', 'Summary'),
    resultsTemplate: value(row, 'Results Template', 'Result Template', 'Template'),
    schedule: value(row, 'Schedule'),
    rules: value(row, 'Rules', 'Rules URL')
  })).filter(league =>
    league.name &&
    ['live', 'external', 'static'].includes(league.type) &&
    league.dataSource
  );
}

function wccaLeague_(requestedName) {
  const name = String(requestedName || '').trim().toLowerCase();
  const entry = wccaLeagueDirectory_().find(league => league.name.toLowerCase() === name);
  if (!entry) throw Error('League not found');

  if (entry.type === 'external') {
    return {
      name: entry.name,
      type: 'external',
      description: entry.description,
      documents: wccaDirectoryDocuments_(entry),
      externalUrl: entry.dataSource
    };
  }

  if (entry.type === 'static') {
    return {
      name: entry.name,
      type: 'static',
      description: entry.description,
      documents: wccaDirectoryDocuments_(entry),
      table: wccaStaticLeagueTable_(entry.dataSource)
    };
  }

  return wccaLiveLeague_(entry);
}

function wccaDirectoryDocuments_(entry) {
  return [
    { label: 'Results template', url: entry.resultsTemplate },
    { label: 'Schedule', url: entry.schedule },
    { label: 'Rules', url: entry.rules }
  ].filter(document => document.url);
}

function wccaMergeDocuments_(first, second) {
  const seen = {};
  return first.concat(second).filter(document => {
    const key = String(document.url || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

/* ---------- Live league results ---------- */

function wccaLiveLeague_(entry) {
  const sheet = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_).getSheetByName(entry.dataSource);
  if (!sheet) throw Error('Live league tab not found: ' + entry.dataSource);

  const values = sheet.getDataRange().getDisplayValues();
  const headerRow = wccaFindResultHeader_(values);
  const settings = wccaLeagueSettings_(values, headerRow);
  const rows = headerRow >= 0 ? wccaObjectRows_(values, headerRow) : [];
  const matches = wccaMatches_(rows, settings);

  return {
    name: entry.name,
    type: 'live',
    description: entry.description,
    settings: settings,
    documents: wccaMergeDocuments_(
      wccaDirectoryDocuments_(entry),
      wccaLeagueDocuments_(settings)
    ),
    standings: wccaStandings_(matches),
    matches: matches
  };
}

function wccaFindResultHeader_(values) {
  for (let row = 0; row < values.length; row++) {
    const headings = values[row].map(wccaKey_);
    if (
      headings.includes('board') &&
      (headings.includes('hometeam') || headings.includes('home')) &&
      (headings.includes('awayteam') || headings.includes('away'))
    ) return row;
  }
  return -1;
}

function wccaLeagueSettings_(values, headerRow) {
  const settings = {};
  const limit = headerRow < 0 ? values.length : headerRow;
  for (let row = 0; row < limit; row++) {
    const key = String(values[row][0] || '').trim();
    const value = String(values[row][1] || '').trim();
    if (key && value) settings[key] = value;
  }
  return settings;
}

function wccaMatches_(rows, settings) {
  const matches = {};

  rows.forEach(row => {
    const date = wccaField_(row, 'date', 'match date');
    const home = wccaField_(row, 'home team', 'home');
    const away = wccaField_(row, 'away team', 'away');
    const board = wccaField_(row, 'board');
    if (!home || !away || !board) return;

    const key = [date, home, away].join('|');
    if (!matches[key]) {
      matches[key] = {
        id: key, date: date, home: home, away: away, boards: [],
        homeScore: 0, awayScore: 0, homeMatchPoints: 0, awayMatchPoints: 0
      };
    }

    const spare = String(board).trim().toUpperCase() === 'S';
    const rawResult = wccaField_(row, 'result', 'home result', 'score');
    const result = wccaBoardResult_(rawResult);
    matches[key].boards.push({
      board: String(board).trim(),
      homePlayer: wccaField_(row, 'home player', 'home name'),
      awayPlayer: wccaField_(row, 'away player', 'away name'),
      result: wccaBoardDisplay_(rawResult),
      notes: wccaField_(row, 'notes', 'note'),
      spare: spare
    });

    // Only numeric boards count in the official match score.  S is a spare:
    // displayed in the match detail, never included in the league calculation.
    if (!spare && /^\d+$/.test(String(board).trim()) && result) {
      matches[key].homeScore += result.home;
      matches[key].awayScore += result.away;
    }
  });

  const winPoints = wccaNumberSetting_(settings, 'Match points win', 2);
  const drawPoints = wccaNumberSetting_(settings, 'Match points draw', 1);

  return Object.values(matches).map(match => {
    if (match.homeScore > match.awayScore) {
      match.homeMatchPoints = winPoints;
    } else if (match.homeScore < match.awayScore) {
      match.awayMatchPoints = winPoints;
    } else {
      match.homeMatchPoints = drawPoints;
      match.awayMatchPoints = drawPoints;
    }
    match.score = wccaFormatScore_(match.homeScore) + '–' + wccaFormatScore_(match.awayScore);
    match.result = match.homeScore === match.awayScore ? 'Draw' :
      (match.homeScore > match.awayScore ? match.home + ' win' : match.away + ' win');
    return match;
  }).sort((a, b) => wccaDate_(b.date) - wccaDate_(a.date));
}

function wccaBoardResult_(value) {
  const result = String(value || '').trim().toUpperCase()
    .replace(/\s/g, '').replace(/½/g, '0.5');

  if (['W', '1-0', '1:0', '1'].includes(result)) return { home: 1, away: 0 };
  if (['L', '0-1', '0:1', '0'].includes(result)) return { home: 0, away: 1 };
  if (['D', 'DRAW', '0.5', '0.5-0.5', '1/2-1/2'].includes(result)) return { home: 0.5, away: 0.5 };
  return null;
}

function wccaBoardDisplay_(value) {
  const score = wccaBoardResult_(value);
  if (!score) return String(value || '').trim();
  if (score.home === 1) return '1–0';
  if (score.away === 1) return '0–1';
  return '½–½';
}

function wccaStandings_(matches) {
  const teams = {};
  const get = name => teams[name] || (teams[name] = {
    team: name, played: 0, won: 0, drawn: 0, lost: 0,
    gamesFor: 0, gamesAgainst: 0, points: 0
  });

  matches.forEach(match => {
    const home = get(match.home);
    const away = get(match.away);
    home.played++;
    away.played++;
    home.gamesFor += match.homeScore;
    home.gamesAgainst += match.awayScore;
    away.gamesFor += match.awayScore;
    away.gamesAgainst += match.homeScore;
    home.points += match.homeMatchPoints;
    away.points += match.awayMatchPoints;

    if (match.homeScore > match.awayScore) { home.won++; away.lost++; }
    else if (match.homeScore < match.awayScore) { away.won++; home.lost++; }
    else { home.drawn++; away.drawn++; }
  });

  return Object.values(teams)
    // Rank on match points only.  GF and GA are displayed as useful
    // information, but are deliberately not tie-breakers.
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team))
    .map((team, index) => Object.assign({ position: index + 1 }, team));
}

function wccaStaticLeagueTable_(tabName) {
  const sheet = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_).getSheetByName(tabName);
  if (!sheet) throw Error('Static table tab not found: ' + tabName);
  const values = sheet.getDataRange().getDisplayValues();
  return {
    headings: values[0] || [],
    rows: values.slice(1).filter(row => row.some(value => String(value).trim()))
  };
}

/* ---------- League setup ---------- */

function setupLeaguesV1() {
  const book = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_);
  const directory = book.getSheetByName('Leagues') || book.insertSheet('Leagues');

  if (directory.getLastRow() === 0) {
    directory.getRange(1, 1, 1, 7).setValues([[
      'League name', 'Type of league', 'Place for the data',
      'Description', 'Results Template', 'Schedule', 'Rules'
    ]]);
    directory.setFrozenRows(1);
    directory.getRange('A1:G1').setFontWeight('bold');
  } else if (directory.getLastColumn() < 7) {
    directory.getRange(1, 4, 1, 4).setValues([[
      'Description', 'Results Template', 'Schedule', 'Rules'
    ]]);
    directory.getRange('D1:G1').setFontWeight('bold');
  }

  wccaEnsureDirectoryRow_(directory, 'Wiltshire 26/27 Open', 'live', 'Wiltshire 26/27 Open');
  wccaEnsureDirectoryRow_(directory, 'Wiltshire 26/27 Minor', 'live', 'Wiltshire 26/27 Minor');
  wccaEnsureLiveTemplate_(book, 'Wiltshire 26/27 Open');
  wccaEnsureLiveTemplate_(book, 'Wiltshire 26/27 Minor');
  SpreadsheetApp.flush();
}

function wccaEnsureDirectoryRow_(sheet, name, type, source) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.slice(1).some(row => String(row[0] || '').trim().toLowerCase() === name.toLowerCase())) return;
  sheet.appendRow([name, type, source]);
}

function wccaEnsureLiveTemplate_(book, name) {
  const sheet = book.getSheetByName(name) || book.insertSheet(name);
  if (sheet.getLastRow() > 0) return; // Never overwrite data someone has entered.

  sheet.getRange(1, 1, 6, 2).setValues([
    ['League Name', name],
    ['Season', '2026/27'],
    ['Match points win', '2'],
    ['Match points draw', '1'],
    ['Rules URL', ''],
    ['Notes', 'Use 1 for a home win, 0 for a home loss, or 0.5 for a draw. Enter S for a spare board: it is shown but does not count.']
  ]);
  sheet.getRange(8, 1, 1, 8).setValues([[
    'Date', 'Home Team', 'Away Team', 'Board',
    'Home Player', 'Away Player', 'Result (1 / 0 / 0.5)', 'Notes'
  ]]);
  sheet.setFrozenRows(8);
  sheet.getRange('A8:H8').setFontWeight('bold');
  sheet.autoResizeColumns(1, 8);
}

/* ---------- helpers ---------- */

function wccaObjectRows_(values, headerRow) {
  const headings = values[headerRow].map(value => String(value).trim());
  return values.slice(headerRow + 1)
    .filter(row => row.some(value => String(value).trim()))
    .map(row => {
      const object = {};
      headings.forEach((heading, index) => { if (heading) object[heading] = String(row[index] || '').trim(); });
      return object;
    });
}

function wccaField_(row, ...names) {
  const keys = Object.keys(row);
  for (const name of names) {
    const wanted = wccaKey_(name);
    const key = keys.find(candidate => wccaKey_(candidate) === wanted);
    if (key && row[key]) return String(row[key]).trim();
  }
  return '';
}

function wccaKey_(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function wccaNumberSetting_(settings, name, fallback) {
  const wanted = wccaKey_(name);
  const key = Object.keys(settings).find(candidate => wccaKey_(candidate) === wanted);
  const value = key ? Number(settings[key]) : NaN;
  return isNaN(value) ? fallback : value;
}

function wccaLeagueDocuments_(settings) {
  return Object.keys(settings)
    .filter(key => /url|link|document|rules|template/i.test(key) && /^https?:\/\//i.test(settings[key]))
    .map(key => ({ label: key.replace(/\s*url\s*$/i, ''), url: settings[key] }));
}

function wccaFormatScore_(score) {
  const whole = Math.floor(score);
  return score - whole === 0.5 ? (whole ? whole : '') + '½' : String(score);
}

function wccaDate_(text) {
  const match = String(text || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1]).getTime();
  const date = new Date(text);
  return isNaN(date.getTime()) ? 0 : date.getTime();
}