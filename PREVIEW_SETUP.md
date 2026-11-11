# Preview setup — separate repository and sandbox API

This creates a disposable preview of the archive branch. It does **not** change the live site, live Google Sheet, live Drive folder, or live Apps Script API.

The preview URL will be:

https://wiltshire-chess.github.io/wiltshire-chess-preview/

A preview is public if someone knows its URL. The no-index file below asks search engines not to list it; it is not access control. Do not put private data in the sandbox Sheet.

## 1. Create the preview repository

In the **Wiltshire-Chess** GitHub organisation, create an **empty** repository named:

**wiltshire-chess-preview**

Do not initialise it with a README, .gitignore or licence.

## 2. Copy this branch into the preview repository

The cleanest Git method is:

~~~bash
git clone --branch codex/league-archive-foundation --single-branch \
  https://github.com/Wiltshire-Chess/wiltshire-chess.github.io.git \
  wiltshire-chess-preview
cd wiltshire-chess-preview
git remote set-url origin https://github.com/Wiltshire-Chess/wiltshire-chess-preview.git
git rm CNAME
cp preview/robots.txt.template robots.txt
git add -A
git commit -m "Create isolated league archive preview"
git push -u origin HEAD:main
~~~

The important safeguards are:

- remove the root **CNAME** file **from the preview repository only**;
- copy **preview/robots.txt.template** to the preview repository root as **robots.txt**;
- leave the live repository and its **main** branch alone.

If using GitHub’s web interface instead, upload the branch files into the new repository, delete its root **CNAME** file, and create a root **robots.txt** using the template before enabling Pages.

## 3. Enable GitHub Pages for the preview repository

1. Open **Settings → Pages** in **Wiltshire-Chess/wiltshire-chess-preview**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**.
4. Save and wait for GitHub’s Pages message.

The expected URL is:

https://wiltshire-chess.github.io/wiltshire-chess-preview/

The preview must not use wiltshirechess.org or any other custom domain.

## 4. Make separate test data

1. Open the production WCCA workbook.
2. Choose **File → Make a copy** and give it an obvious name, for example **WCCA website sandbox data**.
3. Make a separate copy of the News Images folder if the preview will show news images.
4. Treat both copied resources as disposable test data. Do not run an archive against the production workbook.

## 5. Create a sandbox Apps Script API

1. Go to [Apps Script](https://script.google.com/home) and create a project called **WCCA Website Sandbox API**.
2. Add the complete **Code.gs** and **content-extension.gs** files from this branch.
3. In **Code.gs**, change:
   - **SPREADSHEET_ID** to the copied sandbox Sheet ID;
   - **NEWS_FOLDER_ID** to the copied sandbox News Images folder ID.
4. In **content-extension.gs**, change **WCCA_CONTENT_SHEET_ID_** to the copied sandbox Sheet ID.
5. Save. In the function selector, run **setupLeaguesV1** once to add the new optional League-directory headings if required. It does not overwrite existing rows.
6. Deploy → **New deployment** → **Web app**. Use the same public read-only access choice as the live API, then copy the new /exec URL.

## 6. Point only the preview site at the sandbox API

In the **preview repository only**, replace the single URL in **assets/news-config.js**:

~~~js
window.WCCA_NEWS_API_URL = "PASTE-THE-SANDBOX-EXEC-URL-HERE";
~~~

Commit and push that one preview-only configuration edit. Do not put a sandbox URL in the live repository’s **assets/news-config.js**.

## 7. Confirm isolation before trialling an archive

Check all four items:

1. The browser address begins with https://wiltshire-chess.github.io/wiltshire-chess-preview/.
2. The preview repository has no root **CNAME** file.
3. The preview page loads content from the copied Sheet; make one harmless obvious edit in the copied Sheet to prove it.
4. The Apps Script project name is **WCCA Website Sandbox API**, not **Wiltshire Chess API**.

Only after those checks should you follow [ARCHIVE_OPERATION.md](ARCHIVE_OPERATION.md).
