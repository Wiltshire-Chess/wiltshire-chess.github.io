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
      payload = { ok: true, league: wccaLeague_(e.parameter.name || e.parameter.league || '') };
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

/*
 * The League directory is deliberately heading-driven.  Columns may be placed
 * in any order, and older sheets that contain only the original columns keep
 * working.  New metadata is returned by the public API but is not written back
 * to the sheet until setupLeaguesV1 or a confirmed archive operation is run.
 */
const WCCA_LEAGUE_DIRECTORY_COLUMNS_ = [
  'League name', 'Type of league', 'Place for the data',
  'Description', 'Results Template', 'Schedule', 'Rules',
  'League ID', 'Section', 'Season', 'Status', 'Sort order'
];

function wccaLeagueDirectoryContext_() {
  const book = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_);
  const sheet = book.getSheetByName('Leagues');
  if (!sheet || sheet.getLastRow() < 1) {
    return { book: book, sheet: sheet, headings: [], rows: [] };
  }

  const values = sheet.getDataRange().getDisplayValues();
  const headings = (values.shift() || []).map(wccaKey_);
  const rows = values.map((row, index) => ({
    rowNumber: index + 2,
    entry: wccaLeagueEntryFromRow_(row, headings)
  })).filter(item => wccaValidLeagueEntry_(item.entry));

  return { book: book, sheet: sheet, headings: headings, rows: rows };
}

function wccaLeagueDirectory_() {
  return wccaLeagueDirectoryContext_().rows.map(item => item.entry);
}

function wccaLeagueEntryFromRow_(row, headings) {
  const type = wccaDirectoryValue_(row, headings, 'Type of league', 'Type').toLowerCase();
  const defaults = wccaLeagueDefaults_(type);
  const suppliedId = wccaDirectoryValue_(row, headings, 'League ID', 'ID').toLowerCase();
  const sortText = wccaDirectoryValue_(row, headings, 'Sort order', 'Sort Order');
  const parsedSort = Number(sortText);

  return {
    id: /^[a-z0-9-]+$/.test(suppliedId) ? suppliedId : '',
    name: wccaDirectoryValue_(row, headings, 'League name', 'League', 'Name'),
    type: type,
    dataSource: wccaDirectoryValue_(row, headings,
      'Place for the data', 'Data source', 'Source', 'Tab name', 'URL'),
    description: wccaDirectoryValue_(row, headings, 'Description', 'Summary'),
    resultsTemplate: wccaDirectoryValue_(row, headings,
      'Results Template', 'Result Template', 'Template'),
    schedule: wccaDirectoryValue_(row, headings, 'Schedule'),
    rules: wccaDirectoryValue_(row, headings, 'Rules', 'Rules URL'),
    section: wccaLeagueSection_(
      wccaDirectoryValue_(row, headings, 'Section'),
      defaults.section
    ),
    season: wccaDirectoryValue_(row, headings, 'Season'),
    status: wccaDirectoryValue_(row, headings, 'Status') || defaults.status,
    sortOrder: sortText !== '' && isFinite(parsedSort) ? parsedSort : null
  };
}

function wccaDirectoryValue_(row, headings, ...names) {
  for (const name of names) {
    const index = headings.indexOf(wccaKey_(name));
    const raw = index >= 0 ? row[index] : '';
    const candidate = raw === null || raw === undefined ? '' : String(raw).trim();
    if (candidate !== '') return candidate;
  }
  return '';
}

function wccaValidLeagueEntry_(entry) {
  return entry.name &&
    ['live', 'external', 'static'].includes(entry.type) &&
    entry.dataSource;
}

function wccaLeagueDefaults_(type) {
  if (type === 'live') return { section: 'Current', status: 'In progress' };
  if (type === 'static') return { section: 'Historic', status: 'Complete' };
  if (type === 'external') return { section: 'Associated', status: 'External' };
  return { section: 'Current', status: '' };
}

function wccaLeagueSection_(value, fallback) {
  const lookup = {
    current: 'Current',
    historic: 'Historic',
    associated: 'Associated'
  };
  return lookup[String(value || '').trim().toLowerCase()] || fallback;
}

function wccaLeaguePublicMeta_(entry) {
  return {
    id: entry.id,
    name: entry.name,
    type: entry.type,
    section: entry.section,
    season: entry.season,
    status: entry.status,
    sortOrder: entry.sortOrder,
    description: entry.description
  };
}

function wccaLeague_(requestedLeague) {
  const requested = String(requestedLeague || '').trim().toLowerCase();
  const leagues = wccaLeagueDirectory_();

  // New links use an ID.  The name lookup is deliberately retained for old
  // shared URLs such as league.html?league=Wiltshire%2026%2F27%20Open.
  const entry = leagues.find(league => league.id && league.id === requested) ||
    leagues.find(league => league.name.toLowerCase() === requested);
  if (!entry) throw Error('League not found');

  if (entry.type === 'external') {
    return Object.assign(wccaLeaguePublicMeta_(entry), {
      documents: wccaDirectoryDocuments_(entry),
      externalUrl: entry.dataSource
    });
  }

  if (entry.type === 'static') {
    const staticContent = wccaStaticLeagueTable_(entry.dataSource);
    return Object.assign(wccaLeaguePublicMeta_(entry), {
      documents: wccaDirectoryDocuments_(entry),
      table: staticContent.table,
      results: staticContent.results
    });
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

  return Object.assign(wccaLeaguePublicMeta_(entry), {
    settings: settings,
    documents: wccaMergeDocuments_(
      wccaDirectoryDocuments_(entry),
      wccaLeagueDocuments_(settings)
    ),
    standings: wccaStandings_(matches),
    matches: matches
  });
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
  wccaEnsureLeagueDirectoryColumns_(directory);

  // These rows are created only on a new workbook. Existing rows are not
  // overwritten, including any existing IDs, descriptions or document URLs.
  wccaEnsureDirectoryRow_(directory, {
    id: 'open-2026-27',
    name: 'Wiltshire 26/27 Open',
    type: 'live',
    dataSource: 'Wiltshire 26/27 Open',
    section: 'Current',
    season: '2026/27',
    status: 'In progress'
  });
  wccaEnsureDirectoryRow_(directory, {
    id: 'minor-2026-27',
    name: 'Wiltshire 26/27 Minor',
    type: 'live',
    dataSource: 'Wiltshire 26/27 Minor',
    section: 'Current',
    season: '2026/27',
    status: 'In progress'
  });
  wccaEnsureLiveTemplate_(book, 'Wiltshire 26/27 Open');
  wccaEnsureLiveTemplate_(book, 'Wiltshire 26/27 Minor');
  SpreadsheetApp.flush();
}

function wccaEnsureLeagueDirectoryColumns_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, WCCA_LEAGUE_DIRECTORY_COLUMNS_.length)
      .setValues([WCCA_LEAGUE_DIRECTORY_COLUMNS_]);
  } else {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .getDisplayValues()[0].map(wccaKey_);
    WCCA_LEAGUE_DIRECTORY_COLUMNS_.forEach(column => {
      if (!existing.includes(wccaKey_(column))) {
        sheet.getRange(1, sheet.getLastColumn() + 1).setValue(column);
        existing.push(wccaKey_(column));
      }
    });
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]
    .map(wccaKey_);
}

function wccaEnsureDirectoryRow_(sheet, valuesToSet) {
  const headings = wccaEnsureLeagueDirectoryColumns_(sheet);
  const existing = sheet.getDataRange().getDisplayValues();
  const name = String(valuesToSet.name || '').trim().toLowerCase();
  if (existing.slice(1).some(row =>
    wccaDirectoryValue_(row, headings, 'League name', 'League', 'Name')
      .toLowerCase() === name
  )) return;

  const row = Array(headings.length).fill('');
  wccaDirectorySetInRow_(row, headings, ['League ID', 'ID'], valuesToSet.id || '');
  wccaDirectorySetInRow_(row, headings, ['League name', 'League', 'Name'], valuesToSet.name || '');
  wccaDirectorySetInRow_(row, headings, ['Type of league', 'Type'], valuesToSet.type || '');
  wccaDirectorySetInRow_(row, headings,
    ['Place for the data', 'Data source', 'Source', 'Tab name', 'URL'],
    valuesToSet.dataSource || ''
  );
  wccaDirectorySetInRow_(row, headings, ['Section'], valuesToSet.section || '');
  wccaDirectorySetInRow_(row, headings, ['Season'], valuesToSet.season || '');
  wccaDirectorySetInRow_(row, headings, ['Status'], valuesToSet.status || '');
  sheet.appendRow(row);
}

function wccaDirectorySetInRow_(row, headings, names, value) {
  const index = wccaDirectoryColumnIndex_(headings, names);
  if (index >= 0) row[index] = value;
}

function wccaDirectoryColumnIndex_(headings, names) {
  for (const name of names) {
    const index = headings.indexOf(wccaKey_(name));
    if (index >= 0) return index;
  }
  return -1;
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

/* ---------- Safe archive operation ---------- */

/*
 * This function is intentionally NOT exposed through doGet.  It is a manual
 * Apps Script operation.  It requires both Settings values below and only
 * accepts an exact League ID for a currently-live directory entry.
 */
function wccaArchiveLeague() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw Error('Another archive operation is already running. Please wait and try again.');
  }

  try {
    const settingsContext = wccaSettingsContext_();
    const archiveId = wccaReadSetting_(settingsContext, 'Archive League ID');
    const confirmation = wccaReadSetting_(settingsContext, 'Archive Confirmation');

    if (!archiveId) {
      throw Error('Archive League ID is blank. Enter the live league ID in Settings first.');
    }
    if (confirmation !== 'ARCHIVE') {
      throw Error('Archive Confirmation must be exactly ARCHIVE before an archive can run.');
    }

    const directoryContext = wccaLeagueDirectoryContext_();
    if (!directoryContext.sheet) throw Error('Leagues tab not found.');
    const requestedId = archiveId.toLowerCase();
    const directoryRow = directoryContext.rows.find(item =>
      item.entry.id === requestedId
    );

    // Deliberately no league-name fallback here: archive operations must use a
    // stable ID so a human cannot archive the wrong season by a similar name.
    if (!directoryRow) {
      throw Error('Archive League ID "' + archiveId +
        '" does not match a valid League ID in the Leagues tab.');
    }
    if (directoryRow.entry.type !== 'live') {
      throw Error('League "' + directoryRow.entry.name +
        '" is not live and cannot be archived.');
    }

    const book = directoryContext.book;
    const sourceSheet = book.getSheetByName(directoryRow.entry.dataSource);
    if (!sourceSheet) {
      throw Error('Live source tab not found: ' + directoryRow.entry.dataSource);
    }

    // Calculate from the same live parsing and scoring logic used by the
    // public site, then take a values-only copy before altering the directory.
    const finalLeague = wccaLiveLeague_(directoryRow.entry);
    const rawValues = sourceSheet.getDataRange().getValues();
    const stamp = new Date();
    const suffix = wccaArchiveSuffix_(directoryRow.entry);
    const summaryName = wccaUniqueSheetName_(book, 'Archive ' + suffix);
    const rawName = wccaUniqueSheetName_(book, 'Archive Raw ' + suffix);

    // Ensure the metadata columns exist only after every validation above has
    // passed. This never changes values in existing directory rows.
    const directoryHeadings = wccaEnsureLeagueDirectoryColumns_(directoryContext.sheet);

    // New tabs always use unique names. No source or existing archive tab is
    // overwritten or deleted.
    const rawSheet = book.insertSheet(rawName);
    if (rawValues.length && rawValues[0].length) {
      rawSheet.getRange(1, 1, rawValues.length, rawValues[0].length)
        .setValues(rawValues);
    }
    const frozenRows = sourceSheet.getFrozenRows();
    if (frozenRows > 0) rawSheet.setFrozenRows(Math.min(frozenRows, rawValues.length));

    const summarySheet = book.insertSheet(summaryName);
    const summaryValues = wccaArchiveSummaryValues_(directoryRow.entry, finalLeague, stamp);
    const width = summaryValues.reduce((maximum, row) => Math.max(maximum, row.length), 1);
    const rectangularValues = summaryValues.map(row =>
      row.concat(Array(width - row.length).fill(''))
    );
    summarySheet.getRange(1, 1, rectangularValues.length, width)
      .setValues(rectangularValues);
    summarySheet.setFrozenRows(Math.min(3, rectangularValues.length));
    summarySheet.getRange(1, 1, 1, width).setFontWeight('bold');
    summarySheet.autoResizeColumns(1, width);

    wccaDirectorySetCell_(directoryContext.sheet, directoryRow.rowNumber,
      directoryHeadings, ['Type of league', 'Type'], 'static');
    wccaDirectorySetCell_(directoryContext.sheet, directoryRow.rowNumber,
      directoryHeadings,
      ['Place for the data', 'Data source', 'Source', 'Tab name', 'URL'],
      summaryName);
    wccaDirectorySetCell_(directoryContext.sheet, directoryRow.rowNumber,
      directoryHeadings, ['Section'], 'Historic');
    wccaDirectorySetCell_(directoryContext.sheet, directoryRow.rowNumber,
      directoryHeadings, ['Status'], 'Complete');

    const result = 'Archived ' + directoryRow.entry.name + ' to "' +
      summaryName + '" and "' + rawName + '" on ' +
      Utilities.formatDate(stamp, Session.getScriptTimeZone(), 'd MMM yyyy HH:mm');
    wccaWriteSetting_(settingsContext, 'Archive Confirmation', '');
    wccaWriteSetting_(settingsContext, 'Last archive result', result);
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function wccaArchiveSummaryValues_(entry, league, archivedAt) {
  const stamp = Utilities.formatDate(
    archivedAt, Session.getScriptTimeZone(), 'd MMM yyyy HH:mm'
  );
  const rows = [
    ['Archive note', 'Frozen final record created ' + stamp +
      '. The original board-by-board source has been retained in the raw archive tab.'],
    ['TABLE', 'Final standings frozen on ' + stamp + '.', 'header'],
    ['#', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'Pen', 'Pts']
  ];

  (league.standings || []).forEach(team => {
    rows.push([
      team.position, team.team, team.played, team.won, team.drawn, team.lost,
      team.gamesFor, team.gamesAgainst, team.penaltyPoints, team.points
    ]);
  });

  rows.push(
    ['RESULTS', 'Dated match-level results. Board-by-board detail is retained in the raw archive tab.', 'header'],
    ['Date', 'Home Team', 'Home Score', 'Away Score', 'Away Team', 'Result']
  );

  (league.matches || []).forEach(match => {
    rows.push([
      match.date, match.home, wccaFormatScore_(match.homeScore),
      wccaFormatScore_(match.awayScore), match.away, match.result
    ]);
  });

  return rows;
}

function wccaArchiveSuffix_(entry) {
  const name = String(entry.name || 'League').trim();
  const season = String(entry.season || '').trim();
  const combined = season && name.indexOf(season) < 0 ? name + ' ' + season : name;
  return wccaSafeSheetName_(combined) || 'League';
}

function wccaSafeSheetName_(value) {
  return String(value || '')
    .replace(/[\[\]\*\/\\\?\:]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);
}

function wccaUniqueSheetName_(book, base) {
  const safeBase = wccaSafeSheetName_(base) || 'Archive';
  let candidate = safeBase.slice(0, 100);
  let counter = 2;
  while (book.getSheetByName(candidate)) {
    const suffix = ' ' + counter++;
    candidate = safeBase.slice(0, 100 - suffix.length) + suffix;
  }
  return candidate;
}

function wccaDirectorySetCell_(sheet, rowNumber, headings, names, value) {
  const column = wccaDirectoryColumnIndex_(headings, names);
  if (column < 0) throw Error('League directory column is missing: ' + names[0]);
  sheet.getRange(rowNumber, column + 1).setValue(value);
}

function wccaSettingsContext_() {
  const book = SpreadsheetApp.openById(WCCA_CONTENT_SHEET_ID_);
  const sheet = book.getSheetByName('Settings');
  if (!sheet || sheet.getLastRow() < 1) {
    throw Error('Settings tab not found. Add a Settings tab with Setting and Value columns.');
  }
  const values = sheet.getDataRange().getDisplayValues();
  const headings = (values[0] || []).map(wccaKey_);
  const settingColumn = wccaDirectoryColumnIndex_(headings, ['Setting', 'Key']);
  const valueColumn = wccaDirectoryColumnIndex_(headings, ['Value']);
  if (settingColumn < 0 || valueColumn < 0) {
    throw Error('Settings tab must have columns headed Setting and Value.');
  }
  return {
    sheet: sheet,
    values: values,
    settingColumn: settingColumn,
    valueColumn: valueColumn
  };
}

function wccaReadSetting_(context, setting) {
  const wanted = wccaKey_(setting);
  for (let index = 1; index < context.values.length; index++) {
    if (wccaKey_(context.values[index][context.settingColumn]) === wanted) {
      return String(context.values[index][context.valueColumn] || '').trim();
    }
  }
  return '';
}

function wccaWriteSetting_(context, setting, value) {
  const wanted = wccaKey_(setting);
  for (let index = 1; index < context.values.length; index++) {
    if (wccaKey_(context.values[index][context.settingColumn]) === wanted) {
      context.sheet.getRange(index + 1, context.valueColumn + 1).setValue(value);
      context.values[index][context.valueColumn] = value;
      return;
    }
  }
  const row = Math.max(context.sheet.getLastRow() + 1, 2);
  context.sheet.getRange(row, context.settingColumn + 1).setValue(setting);
  context.sheet.getRange(row, context.valueColumn + 1).setValue(value);
  context.values.push(Array(Math.max(context.settingColumn, context.valueColumn) + 1).fill(''));
  context.values[context.values.length - 1][context.settingColumn] = setting;
  context.values[context.values.length - 1][context.valueColumn] = value;
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