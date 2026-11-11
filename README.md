# Wiltshire Chess website

Static GitHub Pages frontend for [Wiltshire Chess](https://wiltshirechess.org), with public content supplied by a read-only Google Apps Script JSONP API backed by Google Sheets.

The production site deploys from the repository’s **main** branch. Apps Script is deployed manually from the canonical source in this repository; pushing website files to GitHub never changes the live API or spreadsheet.

## Main parts

- **assets/** — shared styles and browser JavaScript.
- **apps-script/** — version-controlled source for the separate Google Apps Script project.
- **documents/** — public PDF documents linked by the League directory.
- **preview/robots.txt.template** — a template to copy to the root of a separate preview repository only.

## Content editing

Committee content stays in Google Sheets. The public website reads the configured API URL from **assets/news-config.js**.

League directory rows live in the **Leagues** tab. The original columns remain valid:

| League name | Type of league | Place for the data |
|---|---|---|

Optional columns can appear in any order:

| Description | Results Template | Schedule | Rules | League ID | Section | Season | Status | Sort order |
|---|---|---|---|---|---|---|---|---|

The supported types are **live**, **static**, and **external**.

- **League ID** is a permanent lower-case slug such as open-2026-27. New internal links use it; old name-based links still work.
- **Section** is Current, Associated, or Historic.
- **Season** is free text, normally 2026/27.
- **Status** is normally In progress, Complete, or External.
- **Sort order** is numeric; lower values appear first.

Rows without the new fields remain compatible: live rows appear as Current/In progress, static rows as Historic/Complete, and external rows as Associated/External.

## Archive foundation branch

The branch **codex/league-archive-foundation** adds a deliberately manual **wccaArchiveLeague()** function. It is designed to be trialled only in a copied Sheet and separately deployed sandbox API before it is considered for production.

- [Preview setup](PREVIEW_SETUP.md)
- [Archive trial operation](ARCHIVE_OPERATION.md)
- [Apps Script source and deployment notes](apps-script/README.md)

The archive feature makes a values-only raw copy and a frozen static summary. It never deletes the original live source tab or overwrites an existing archive tab.
