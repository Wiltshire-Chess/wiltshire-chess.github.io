const SPREADSHEET_ID = '1RrAlAiASvgZA22cYCH53WD-ThNx-F4PJzNViwEVdSRc';
const NEWS_FOLDER_ID = '1k90MNFHLn0254SFwU52TNzCd-C7vh_Ab';
const NEWS_SHEET = 'News';

/*
 * Wiltshire Chess spreadsheet service
 *
 * The public website uses this as a read-only JSON/JSONP endpoint.
 * Run setupLeaguesV1 once to add the league directory and two empty
 * live-league templates.
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.section) return wccaSectionResponse_(p);
    return wccaNewsResponse_(p);
  } catch (error) {
    return wccaOutput_({ ok: false, error: String(error.message || error) }, p.callback);
  }
}

function wccaNewsResponse_(p) {
  const articles = getPublishedArticles();

  if (p.image) {
    const permitted = new Set(articles.reduce((all, article) => all.concat(article.images), []));
    const requested = String(p.image);
    const original = requested.indexOf('thumb-') === 0 ? requested.slice(6) : requested;
    const allowed = permitted.has(original) ||
      permitted.has(original.replace(/\.(jpg|jpeg|png|webp)$/i, ''));

    if (!allowed) throw new Error('Image not published');

    const files = DriveApp.getFolderById(NEWS_FOLDER_ID).getFilesByName(requested);
    if (!files.hasNext()) throw new Error('Image not found: ' + requested);

    const blob = files.next().getBlob();
    if (blob.getBytes().length > 5 * 1024 * 1024) {
      throw new Error('Image exceeds 5 MB');
    }
    return wccaOutput_({
      ok: true,
      image: 'data:' + blob.getContentType() + ';base64,' +
        Utilities.base64Encode(blob.getBytes())
    }, p.callback);
  }

  return wccaOutput_({ ok: true, articles: articles }, p.callback);
}

function wccaSectionResponse_(p) {
  let result;
  switch (String(p.section).toLowerCase()) {
    case 'settings':
      result = { ok: true, settings: getSettings_() };
      break;
    case 'clubs':
      result = { ok: true, clubs: getClubs_() };
      break;
    case 'committee':
      result = { ok: true, committee: getCommittee_() };
      break;
    case 'pages':
      result = { ok: true, pages: getPages_() };
      break;
    case 'leagues':
      // Deliberately only returns the directory: no match data is downloaded
      // until a visitor opens one league.
      result = { ok: true, leagues: getLeagueDirectory_() };
      break;
    case 'league':
      result = { ok: true, league: getLeague_(p.name || p.league || '') };
      break;
    default:
      throw new Error('Unknown section: ' + p.section);
  }
  return wccaOutput_(result, p.callback);
}

function wccaOutput_(value, callback) {
  callback = String(callback || '');
  if (callback && !/^[a-zA-Z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput('Invalid callback');
  }
  const json = JSON.stringify(value);
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function getBook_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getPublishedArticles() {
  const sheet = getBook_().getSheetByName(NEWS_SHEET);
  if (!sheet) throw new Error('News tab not found');

  const rows = sheet.getDataRange().getDisplayValues();
  if (!rows.length) return [];
  const headings = rows.shift().map(normalise);
  const now = new Date();

  return rows.map(function(row, index) {
    const published = rowField_(row, headings, ['PublicationDate', 'Publish Date', 'Date']);
    const expires = rowField_(row, headings, ['UnpublishDate', 'Unpublish Date', 'ExpiryDate']);
    const image1 = rowField_(row, headings, ['ImageURL', 'Image Filename', 'Image1', 'Image']);
    const image2 = rowField_(row, headings, ['Image2', 'Image Filename 2']);
    const image3 = rowField_(row, headings, ['Image3', 'Image Filename 3']);
    return {
      id: rowField_(row, headings, ['ArticleID', 'Article ID', 'ID']) || String(index + 1),
      title: rowField_(row, headings, ['Headline', 'Title']),
      summary: rowField_(row, headings, ['Summary']),
      body: rowField_(row, headings, ['Body', 'Main Text', 'Article']),
      status: rowField_(row, headings, ['Status']),
      visible: rowField_(row, headings, ['Visible']),
      published: published,
      expires: expires,
      tag: rowField_(row, headings, ['PrimaryTag', 'Primary Tag']),
      tags: rowField_(row, headings, ['Tags']),
      author: rowField_(row, headings, ['Author']),
      icon: rowField_(row, headings, ['Icon']),
      images: [image1, image2, image3].filter(Boolean)
    };
  }).filter(function(article) {
    if (!article.title) return false;
    if (article.status && article.status.toLowerCase() !== 'published') return false;
    if (['false', 'no', '0', 'hidden'].indexOf(article.visible.toLowerCase()) >= 0) return false;
    const start = parseDate(article.published);
    const end = parseDate(article.expires);
    return (!start || start <= now) && (!end || end > now);
  });
}

function getSettings_() {
  return getKeyValueTab_('Settings');
}

function getClubs_() {
  return getRowsAsObjects_('Clubs').map(function(r) {
    return {
      club: objectField_(r, ['Club Name', 'Club', 'Name']),
      location: objectField_(r, ['Location', 'Venue']),
      webPage: objectField_(r, ['Web URL', 'Web Page', 'Website', 'URL'])
    };
  }).filter(function(r) { return r.club; });
}

function getCommittee_() {
  return getRowsAsObjects_('Committee').map(function(r) {
    const section = objectField_(r, ['Section', 'Type', 'Details']);
    const role = objectField_(r, ['Role', 'Committee Role']);
    const person = objectField_(r, ['Person', 'Value', 'Name', 'Contact details', 'Contact Details']);
    return {
      section: section,
      role: role,
      value: person,
      extraText: objectField_(r, ['Extra Text', 'Notes'])
    };
  }).filter(function(r) { return r.section || r.role || r.value; });
}

function getPages_() {
  return getRowsAsObjects_('Pages').map(function(r) {
    return {
      id: objectField_(r, ['ID', 'Page ID']).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      navigationLabel: objectField_(r, ['Navigation Label', 'Navigation', 'Label', 'Title']),
      title: objectField_(r, ['Title', 'Page Title']),
      eyebrow: objectField_(r, ['Eyebrow']),
      introduction: objectField_(r, ['Introduction', 'Summary']),
      mainText: objectField_(r, ['Main Text', 'Body', 'Text'])
    };
  }).filter(function(r) { return r.id && r.navigationLabel; });
}

/* ---------- League directory and live-results engine ---------- */

function getLeagueDirectory_() {
  return getRowsAsObjects_('Leagues').map(function(r) {
    const type = objectField_(r, ['Type of league', 'Type']).toLowerCase();
    return {
      name: objectField_(r, ['League name', 'League', 'Name']),
      type: type,
      dataSource: objectField_(r, ['Place for the data', 'Data source', 'Source', 'Tab name', 'URL']),
      description: objectField_(r, ['Description', 'Summary'])
    };
  }).filter(function(r) {
    return r.name && ['live', 'external', 'static'].indexOf(r.type) >= 0 && r.dataSource;
  });
}

function getLeague_(name) {
  const requested = String(name || '').trim();
  const entry = getLeagueDirectory_().filter(function(item) {
    return item.name.toLowerCase() === requested.toLowerCase();
  })[0];
  if (!entry) throw new Error('League not found');

  if (entry.type === 'external') {
    return {
      name: entry.name, type: entry.type, description: entry.description,
      externalUrl: entry.dataSource
    };
  }
  if (entry.type === 'static') {
    return {
      name: entry.name, type: entry.type, description: entry.description,
      table: getSimpleTable_(entry.dataSource)
    };
  }
  return getLiveLeague_(entry);
}

function getLiveLeague_(entry) {
  const sheet = getBook_().getSheetByName(entry.dataSource);
  if (!sheet) throw new Error('Live league tab not found: ' + entry.dataSource);
  const values = sheet.getDataRange().getDisplayValues();
  const headerAt = findResultHeaderRow_(values);
  const settings = getSettingsBefore_(values, headerAt);
  const resultRows = headerAt >= 0 ? rowsFromMatrix_(values, headerAt) : [];
  const matches = groupMatches_(resultRows, settings);
  const standings = calculateStandings_(matches, settings);

  return {
    name: entry.name,
    type: 'live',
    description: entry.description,
    settings: settings,
    documents: documentsFromSettings_(settings),
    matches: matches,
    standings: standings
  };
}

function findResultHeaderRow_(values) {
  for (let r = 0; r < values.length; r++) {
    const headings = values[r].map(normalise);
    if (headings.indexOf('board') >= 0 &&
        (headings.indexOf('hometeam') >= 0 || headings.indexOf('home') >= 0) &&
        (headings.indexOf('awayteam') >= 0 || headings.indexOf('away') >= 0)) return r;
  }
  return -1;
}

function getSettingsBefore_(values, headerAt) {
  const settings = {};
  const limit = headerAt < 0 ? Math.min(values.length, 20) : headerAt;
  for (let r = 0; r < limit; r++) {
    const key = String(values[r][0] || '').trim();
    const value = String(values[r][1] || '').trim();
    if (key && value) settings[key] = value;
  }
  return settings;
}

function documentsFromSettings_(settings) {
  return Object.keys(settings).filter(function(key) {
    return /url|link|document|rules|template/i.test(key) &&
      /^https?:\/\//i.test(settings[key]);
  }).map(function(key) {
    return { label: key.replace(/\s*url\s*$/i, ''), url: settings[key] };
  });
}

function groupMatches_(rows, settings) {
  const matches = {};
  rows.forEach(function(row, index) {
    const date = objectField_(row, ['Date', 'Match Date']);
    const home = objectField_(row, ['Home Team', 'Home']);
    const away = objectField_(row, ['Away Team', 'Away']);
    const board = objectField_(row, ['Board']);
    if (!home || !away || !board) return;

    const key = [date, home, away].join('|');
    if (!matches[key]) matches[key] = {
      id: key, date: date, home: home, away: away, boards: [],
      homeScore: 0, awayScore: 0, homeMatchPoints: 0, awayMatchPoints: 0
    };

    const parsed = boardResult_(objectField_(row, ['Result', 'Home Result', 'Score']));
    const spare = String(board).trim().toUpperCase() === 'S';
    const boardRow = {
      board: String(board).trim(),
      homePlayer: objectField_(row, ['Home Player', 'Home Name']),
      awayPlayer: objectField_(row, ['Away Player', 'Away Name']),
      result: objectField_(row, ['Result', 'Home Result', 'Score']),
      notes: objectField_(row, ['Notes', 'Note']),
      spare: spare
    };
    matches[key].boards.push(boardRow);
    if (!spare && parsed) {
      matches[key].homeScore += parsed.home;
      matches[key].awayScore += parsed.away;
    }
  });

  return Object.keys(matches).map(function(key) {
    const match = matches[key];
    if (match.homeScore > match.awayScore) {
      match.homeMatchPoints = numberSetting_(settings, ['Match points win', 'Win points'], 2);
    } else if (match.homeScore < match.awayScore) {
      match.awayMatchPoints = numberSetting_(settings, ['Match points win', 'Win points'], 2);
    } else {
      const draw = numberSetting_(settings, ['Match points draw', 'Draw points'], 1);
      match.homeMatchPoints = draw;
      match.awayMatchPoints = draw;
    }
    match.score = formatHalf_(match.homeScore) + '–' + formatHalf_(match.awayScore);
    match.result = match.homeScore === match.awayScore ? 'Draw' :
      (match.homeScore > match.awayScore ? match.home + ' win' : match.away + ' win');
    return match;
  }).sort(function(a, b) {
    return parseDate(b.date || '') - parseDate(a.date || '');
  });
}

function boardResult_(result) {
  const r = String(result || '').trim().toUpperCase()
    .replace(/\s/g, '').replace('½', '0.5').replace('¼', '0.25').replace('¾', '0.75');
  if (['W', '1-0', '1:0', '1'].indexOf(r) >= 0) return { home: 1, away: 0 };
  if (['L', '0-1', '0:1', '0'].indexOf(r) >= 0) return { home: 0, away: 1 };
  if (['D', 'DRAW', '0.5-0.5', '½-½', '1/2-1/2'].indexOf(r) >= 0) return { home: 0.5, away: 0.5 };
  return null;
}

function calculateStandings_(matches, settings) {
  const teams = {};
  function team(name) {
    if (!teams[name]) teams[name] = {
      team: name, played: 0, won: 0, drawn: 0, lost: 0,
      gamePoints: 0, matchPoints: 0
    };
    return teams[name];
  }
  matches.forEach(function(m) {
    const home = team(m.home), away = team(m.away);
    home.played++; away.played++;
    home.gamePoints += m.homeScore; away.gamePoints += m.awayScore;
    home.matchPoints += m.homeMatchPoints; away.matchPoints += m.awayMatchPoints;
    if (m.homeScore > m.awayScore) { home.won++; away.lost++; }
    else if (m.homeScore < m.awayScore) { away.won++; home.lost++; }
    else { home.drawn++; away.drawn++; }
  });
  return Object.keys(teams).map(function(key) { return teams[key]; }).sort(function(a, b) {
    return b.matchPoints - a.matchPoints || b.gamePoints - a.gamePoints || a.team.localeCompare(b.team);
  }).map(function(row, index) {
    row.position = index + 1;
    return row;
  });
}

function numberSetting_(settings, alternatives, fallback) {
  for (let i = 0; i < alternatives.length; i++) {
    const wanted = normalise(alternatives[i]);
    const key = Object.keys(settings).filter(function(k) { return normalise(k) === wanted; })[0];
    if (key) {
      const value = Number(settings[key]);
      if (!isNaN(value)) return value;
    }
  }
  return fallback;
}

function formatHalf_(value) {
  const whole = Math.floor(value);
  const remainder = value - whole;
  if (remainder === 0.5) return (whole ? whole : '') + '½';
  return String(value);
}

function getSimpleTable_(sheetName) {
  const values = getBook_().getSheetByName(sheetName);
  if (!values) throw new Error('Static table tab not found: ' + sheetName);
  const range = values.getDataRange().getDisplayValues();
  if (!range.length) return { headings: [], rows: [] };
  return { headings: range[0], rows: range.slice(1).filter(function(r) { return r.some(String); }) };
}

/* ---------- generic spreadsheet helpers ---------- */

function getRowsAsObjects_(sheetName) {
  const sheet = getBook_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return rowsFromMatrix_(sheet.getDataRange().getDisplayValues(), 0);
}

function rowsFromMatrix_(values, headerAt) {
  const headings = values[headerAt].map(function(h) { return String(h).trim(); });
  return values.slice(headerAt + 1).filter(function(row) {
    return row.some(function(value) { return String(value).trim() !== ''; });
  }).map(function(row) {
    const out = {};
    headings.forEach(function(heading, index) { out[heading] = String(row[index] || '').trim(); });
    return out;
  });
}

function getKeyValueTab_(sheetName) {
  const sheet = getBook_().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 1) return {};
  const values = sheet.getDataRange().getDisplayValues();
  const out = {};
  // Supports a simple Field / Value sheet and also a one-row heading/value sheet.
  if (normalise(values[0][0]) === 'field' || normalise(values[0][0]) === 'setting') {
    values.slice(1).forEach(function(row) { if (row[0]) out[String(row[0]).trim()] = String(row[1] || '').trim(); });
  } else {
    values[0].forEach(function(key, index) { if (key) out[String(key).trim()] = String((values[1] || [])[index] || '').trim(); });
  }
  return out;
}

function rowField_(row, headings, names) {
  for (let i = 0; i < names.length; i++) {
    const index = headings.indexOf(normalise(names[i]));
    if (index >= 0 && row[index]) return String(row[index]).trim();
  }
  return '';
}

function objectField_(row, names) {
  const keys = Object.keys(row);
  for (let i = 0; i < names.length; i++) {
    const wanted = normalise(names[i]);
    for (let j = 0; j < keys.length; j++) {
      if (normalise(keys[j]) === wanted && row[keys[j]]) return String(row[keys[j]]).trim();
    }
  }
  return '';
}

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1]);
  const date = new Date(text);
  return isNaN(date.getTime()) ? null : date;
}

/* ---------- one-time spreadsheet setup ---------- */

function setupLeaguesV1() {
  const book = getBook_();
  const directory = getOrCreateSheet_(book, 'Leagues');
  if (directory.getLastRow() === 0) {
    directory.getRange(1, 1, 1, 3).setValues([['League name', 'Type of league', 'Place for the data']]);
  }
  ensureLeagueDirectoryRow_(directory, 'Wiltshire 26/27 Open', 'live', 'Wiltshire 26/27 Open');
  ensureLeagueDirectoryRow_(directory, 'Wiltshire 26/27 Minor', 'live', 'Wiltshire 26/27 Minor');

  ensureLiveLeagueTemplate_(book, 'Wiltshire 26/27 Open');
  ensureLiveLeagueTemplate_(book, 'Wiltshire 26/27 Minor');
  SpreadsheetApp.flush();
}

function getOrCreateSheet_(book, name) {
  return book.getSheetByName(name) || book.insertSheet(name);
}

function ensureLeagueDirectoryRow_(sheet, name, type, source) {
  const rows = sheet.getDataRange().getDisplayValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]).trim().toLowerCase() === name.toLowerCase()) return;
  }
  sheet.appendRow([name, type, source]);
}

function ensureLiveLeagueTemplate_(book, name) {
  const sheet = getOrCreateSheet_(book, name);
  if (sheet.getLastRow() > 0) return; // Never overwrite an existing league.
  sheet.getRange(1, 1, 6, 2).setValues([
    ['League Name', name],
    ['Season', '2026/27'],
    ['Match points win', '2'],
    ['Match points draw', '1'],
    ['Rules URL', ''],
    ['Notes', 'Use a numeric Board value for a counting board; use S for a spare board.']
  ]);
  sheet.getRange(8, 1, 1, 8).setValues([[
    'Date', 'Home Team', 'Away Team', 'Board',
    'Home Player', 'Away Player', 'Result', 'Notes'
  ]]);
  sheet.setFrozenRows(8);
  sheet.getRange('A8:H8').setFontWeight('bold');
  sheet.autoResizeColumns(1, 8);
}