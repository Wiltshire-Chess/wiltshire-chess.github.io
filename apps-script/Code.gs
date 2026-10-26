const SPREADSHEET_ID = '1RrAlAiASvgZA22cYCH53WD-ThNx-F4PJzNViwEVdSRc';
const NEWS_FOLDER_ID = '1k90MNFHLn0254SFwU52TNzCd-C7vh_Ab';
const NEWS_SHEET = 'News';

function wccaOriginalDoGet(e) {
  if (e.parameter.section) return wccaSectionResponse_(e);
  const p = e.parameter || {};
  const callback = p.callback || '';

  if (callback && !/^[a-zA-Z_$][\w$]*$/.test(callback)) {
    return ContentService.createTextOutput('Invalid callback');
  }

  let result;

  try {
    const articles = getPublishedArticles();

    if (p.image) {
      // Only serve images referenced by published articles.
      const permitted = new Set(articles.flatMap(a => a.images));
      const requested = String(p.image);
      const original = requested.startsWith('thumb-') ? requested.slice(6) : requested;
      const allowed = permitted.has(original) ||
        permitted.has(original.replace(/\.(jpg|jpeg|png|webp)$/i, ''));

      if (!allowed) throw new Error('Image not published');

      const folder = DriveApp.getFolderById(NEWS_FOLDER_ID);
      const files = folder.getFilesByName(p.image);
      if (!files.hasNext()) throw new Error('Image not found: ' + p.image);

      const blob = files.next().getBlob();
      const bytes = blob.getBytes();
      if (bytes.length > 5 * 1024 * 1024) throw new Error('Image exceeds 5 MB');

      result = {
        ok: true,
        image: 'data:' + blob.getContentType() +
          ';base64,' + Utilities.base64Encode(blob.getBytes())
      };
    } else {
      result = { ok: true, articles: getPublishedArticles() };
    }
  } catch (error) {
    result = { ok: false, error: String(error.message) };
  }

  const json = JSON.stringify(result);
  const output = callback ? callback + '(' + json + ');' : json;
  return ContentService.createTextOutput(output)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function getPublishedArticles() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NEWS_SHEET);
  if (!sheet) throw new Error('News tab not found');

  const rows = sheet.getDataRange().getDisplayValues();
  const headings = rows.shift().map(normalise);

  function field(row, ...names) {
    for (const name of names) {
      const index = headings.indexOf(normalise(name));
      if (index >= 0 && row[index]) return row[index].trim();
    }
    return '';
  }

  const now = new Date();
  return rows.map((row, index) => {
    const published = field(row, 'PublicationDate', 'Publish Date', 'Date');
    const expires = field(row, 'UnpublishDate', 'Unpublish Date', 'ExpiryDate');
    const image1 = field(row, 'ImageURL', 'Image Filename', 'Image1', 'Image');
    const image2 = field(row, 'Image2', 'Image Filename 2');
    const image3 = field(row, 'Image3', 'Image Filename 3');

    return {
      id: field(row, 'ArticleID', 'Article ID', 'ID') || String(index + 1),
      title: field(row, 'Headline', 'Title'),
      summary: field(row, 'Summary'),
      body: field(row, 'Body', 'Main Text', 'Article'),
      status: field(row, 'Status'),
      visible: field(row, 'Visible'),
      published, expires,
      tag: field(row, 'PrimaryTag', 'Primary Tag'),
      tags: field(row, 'Tags'),
      author: field(row, 'Author'),
      icon: field(row, 'Icon'),
      images: [image1, image2, image3].filter(Boolean)
    };
  }).filter(a => {
    if (!a.title) return false;
    if (a.status && a.status.toLowerCase() !== 'published') return false;
    if (['false', 'no', '0', 'hidden'].includes(a.visible.toLowerCase())) return false;
    const start = parseDate(a.published);
    const end = parseDate(a.expires);
    return (!start || start <= now) && (!end || end > now);
  });
}

function normalise(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
  if (!value) return null;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return new Date(+match[3], +match[2] - 1, +match[1]);
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Run once, while signed in as the Wiltshire Chess Google account.
 * Creates the spreadsheet edit trigger and fills any existing blank News IDs.
 */
function wccaEnableNewsIdAutomation() {
  const handler = 'wccaNewsIdOnEdit_';
  const exists = ScriptApp.getProjectTriggers()
    .some(trigger => trigger.getHandlerFunction() === handler);

  if (!exists) {
    ScriptApp.newTrigger(handler)
      .forSpreadsheet(SPREADSHEET_ID)
      .onEdit()
      .create();
  }

  return wccaAssignMissingNewsIds_();
}

/**
 * Runs automatically when News rows are edited. A title with no Article ID
 * receives a permanent UUID. Existing IDs are never altered.
 */
function wccaNewsIdOnEdit_(event) {
  if (!event || !event.range) return;

  const sheet = event.range.getSheet();
  if (sheet.getName() !== NEWS_SHEET) return;

  const firstRow = Math.max(2, event.range.getRow());
  const lastRow = event.range.getLastRow();
  if (lastRow < 2) return;

  wccaAssignNewsIdsInRows_(sheet, firstRow, lastRow);
}

/**
 * Fills IDs for existing News entries where a title is present but Article ID
 * is blank. It deliberately does not overwrite existing IDs.
 */
function wccaAssignMissingNewsIds_() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
    .getSheetByName(NEWS_SHEET);

  if (!sheet || sheet.getLastRow() < 2) return 0;
  return wccaAssignNewsIdsInRows_(sheet, 2, sheet.getLastRow());
}

function wccaAssignNewsIdsInRows_(sheet, firstRow, lastRow) {
  const headings = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(normalise);

  const idIndex = ['articleid', 'id']
    .map(name => headings.indexOf(name))
    .find(index => index >= 0);
  const titleIndex = ['headline', 'title']
    .map(name => headings.indexOf(name))
    .find(index => index >= 0);

  if (idIndex === undefined || titleIndex === undefined) {
    throw new Error('News tab requires Article ID and Title/Headline columns');
  }

  const rowCount = lastRow - firstRow + 1;
  const titles = sheet.getRange(firstRow, titleIndex + 1, rowCount, 1)
    .getDisplayValues();
  const ids = sheet.getRange(firstRow, idIndex + 1, rowCount, 1)
    .getDisplayValues();

  let created = 0;
  for (let offset = 0; offset < rowCount; offset += 1) {
    if (String(titles[offset][0]).trim() &&
        !String(ids[offset][0]).trim()) {
      sheet.getRange(firstRow + offset, idIndex + 1)
        .setValue(Utilities.getUuid());
      created += 1;
    }
  }
  return created;
}

