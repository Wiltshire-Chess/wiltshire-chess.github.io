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
    const staticContent = wccaStaticLeagueTable_(entry.dataSource);
    return {
      name: entry.name,
      type: 'static',
      description: entry.description,
      documents: wccaDirectoryDocuments_(entry),
      table: staticContent.table,
      results: staticContent.results
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
        homeScore: 0, awayScore: 0, homeMatchPoints: 0, awayMatchPoints: 0,
        homePenaltyPoints: 0, awayPenaltyPoints: 0
      };
    }

    const boardValue = String(board).trim();
    const boardInfo = wccaBoardInfo_(boardValue);
    const spare = boardInfo.spare;
    const defaultInfo = wccaDefaultInfo_(wccaField_(row, 'default', 'default status'));
    const rawResult = wccaField_(row, 'result', 'home result', 'score');
    // A default determines the board result even if the spreadsheet result
    // cell is blank or has been entered incorrectly.
    const result = defaultInfo.side === 'H' ? { home: 0, away: 1 } :
      defaultInfo.side === 'A' ? { home: 1, away: 0 } :
      wccaBoardResult_(rawResult);
    const displayedResult = defaultInfo.side === 'H' ? '0–1' :
      defaultInfo.side === 'A' ? '1–0' : wccaBoardDisplay_(rawResult);
    const penalty = defaultInfo.penaltyEligible ? wccaDefaultPenalty_(boardInfo) : 0;

    matches[key].boards.push({
      board: boardValue,
      homePlayer: wccaField_(row, 'home player', 'home name'),
      awayPlayer: wccaField_(row, 'away player', 'away name'),
      result: displayedResult,
      notes: wccaField_(row, 'notes', 'note'),
      spare: spare,
      homeColour: boardInfo.homeColour,
      awayColour: wccaOtherColour_(boardInfo.homeColour),
      colourOverride: boardInfo.colourOverride,
      defaultCode: defaultInfo.code,
      penaltyPoints: penalty
    });

    if (defaultInfo.side === 'H') matches[key].homePenaltyPoints += penalty;
    if (defaultInfo.side === 'A') matches[key].awayPenaltyPoints += penalty;

    // Only numbered league boards count in the official match score. S, S6,
    // S6B, etc. are spare boards: displayed but never included in the table.
    if (!spare && boardInfo.number && result) {
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

// H and A are ordinary board defaults. HA and AA record a match default
// agreed in advance, which scores the board but carries no penalty.
function wccaDefaultInfo_(value) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (code === 'H') return { code: 'H', side: 'H', penaltyEligible: true };
  if (code === 'A') return { code: 'A', side: 'A', penaltyEligible: true };
  if (code === 'HA') return { code: 'HA', side: 'H', penaltyEligible: false };
  if (code === 'AA') return { code: 'AA', side: 'A', penaltyEligible: false };
  return { code: '', side: '', penaltyEligible: false };
}

function wccaBoardInfo_(value) {
  const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  // Legacy S is still accepted, but has no board number or derived colours.
  if (text === 'S') {
    return { spare: true, number: 0, homeColour: '', colourOverride: false };
  }

  // 1–99 are regular boards; S6–S99 are spares. A final B/W overrides
  // the normal convention and always states the Home player's colour.
  const match = text.match(/^(S?)(\d+)([BW])?$/);
  if (!match) {
    return { spare: false, number: 0, homeColour: '', colourOverride: false };
  }

  const spare = match[1] === 'S';
  const number = Number(match[2]);
  const override = match[3];
  const homeColour = override === 'B' ? 'Black' :
    override === 'W' ? 'White' :
    (number % 2 ? 'Black' : 'White');

  return {
    spare: spare,
    number: number,
    homeColour: homeColour,
    colourOverride: Boolean(override)
  };
}

function wccaOtherColour_(colour) {
  return colour === 'Black' ? 'White' : colour === 'White' ? 'Black' : '';
}

function wccaDefaultPenalty_(boardInfo) {
  if (boardInfo.spare) return 1;
  const number = Number(boardInfo.number);
  if (number === 1) return 5;
  if (number === 2) return 4;
  if (number === 3) return 3;
  if (number === 4) return 2;
  return number > 4 ? 1 : 0;
}

function wccaStandings_(matches) {
  const teams = {};
  const get = name => teams[name] || (teams[name] = {
    team: name, played: 0, won: 0, drawn: 0, lost: 0,
    gamesFor: 0, gamesAgainst: 0, rawMatchPoints: 0,
    penaltyPoints: 0, pointDeduction: 0, points: 0
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
    home.rawMatchPoints += match.homeMatchPoints;
    away.rawMatchPoints += match.awayMatchPoints;
    home.penaltyPoints += match.homePenaltyPoints;
    away.penaltyPoints += match.awayPenaltyPoints;

    if (match.homeScore > match.awayScore) { home.won++; away.lost++; }
    else if (match.homeScore < match.awayScore) { away.won++; home.lost++; }
    else { home.drawn++; away.drawn++; }
  });

  const ranked = Object.values(teams);
  ranked.forEach(team => {
    // Rule 14(d): one match point is deducted for every 10 penalty points.
    team.pointDeduction = Math.floor(team.penaltyPoints / 10);
    team.points = team.rawMatchPoints - team.pointDeduction;
  });

  ranked.sort((a, b) =>
    // Rule 14(a), then 14(b), then 14(d). Head-to-head and the
    // lowest-board calculation remain deliberately manual for now.
    b.points - a.points ||
    b.gamesFor - a.gamesFor ||
    a.penaltyPoints - b.penaltyPoints ||
    a.team.localeCompare(b.team)
  );

  // Teams not separated by an implemented tie-break share the position.
  // Keep the last ordinal separately; the source team rows do not yet have
  // display positions while Array.map is running.
  let lastOrdinal = 0;
  return ranked.map((team, index, all) => {
    const prior = all[index - 1];
    const equal = prior &&
      team.points === prior.points &&
      team.gamesFor === prior.gamesFor &&
      team.penaltyPoints === prior.penaltyPoints;
    if (!equal) lastOrdinal = index + 1;
    const position = (equal ? '=' : '') + lastOrdinal;
    let tieBreak = '';
    if (prior && team.points === prior.points) {
      if (team.gamesFor !== prior.gamesFor) tieBreak = 'Separated on game points';
      else if (team.penaltyPoints !== prior.penaltyPoints) tieBreak = 'Separated on penalty points';
    }
    return Object.assign({ position: position, tieBreak: tieBreak }, team);
  });
}

function wccaStaticLeagueTable_(tabName) {
  const sheet = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_).getSheetByName(tabName);
  if (!sheet) throw Error('Static table tab not found: ' + tabName);
  const values = sheet.getDataRange().getDisplayValues();

  // Old static tabs remain valid: their first row is simply the table header.
  if (!values.some(row => wccaStaticMarker_(row))) {
    return {
      table: {
        headings: values[0] || [],
        rows: values.slice(1).filter(row => row.some(value => String(value).trim())),
        commentary: '',
        commentaryPlacement: 'footer'
      },
      results: null
    };
  }

  const sections = { table: null, results: null };
  for (let index = 0; index < values.length; index++) {
    const marker = wccaStaticMarker_(values[index]);
    if (!marker) continue;

    // The row immediately after a marker is its header row. Data continues
    // until the next TABLE/RESULTS marker, or the end of the sheet.
    const headings = values[index + 1] || [];
    const rows = [];
    let end = index + 2;
    while (end < values.length && !wccaStaticMarker_(values[end])) {
      if (values[end].some(value => String(value).trim())) rows.push(values[end]);
      end++;
    }

    sections[marker] = {
      headings: headings,
      rows: rows,
      commentary: String(values[index][1] || '').trim(),
      commentaryPlacement: wccaStaticCommentaryPlacement_(values[index][2])
    };
    index = end - 1;
  }
  return sections;
}

function wccaStaticMarker_(row) {
  const marker = String((row || [])[0] || '').trim().toUpperCase();
  if (marker === 'TABLE') return 'table';
  if (marker === 'RESULTS') return 'results';
  return '';
}

function wccaStaticCommentaryPlacement_(value) {
  return String(value || '').trim().toLowerCase() === 'header'
    ? 'header'
    : 'footer';
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
    ['Notes', 'Use 1 for a home win, 0 for a home loss, or 0.5 for a draw. Board: 1, 2 etc.; use S6, S7 etc. for spares. A final B or W overrides the Home player colour (for example 1W or S6B). Default: H or A; HA or AA is agreed in advance and carries no penalty.']
  ]);
  sheet.getRange(8, 1, 1, 9).setValues([[
    'Date', 'Home Team', 'Away Team', 'Board',
    'Home Player', 'Away Player', 'Result (1 / 0 / 0.5)', 'Default', 'Notes'
  ]]);
  sheet.setFrozenRows(8);
  sheet.getRange('A8:I8').setFontWeight('bold');
  sheet.autoResizeColumns(1, 9);
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