# Wiltshire Chess Apps Script source

This folder is the version-controlled source for the separately deployed **Wiltshire Chess API** Apps Script project.

- **Code.gs** — News and image endpoint.
- **content-extension.gs** — Settings, Clubs, Committee, Pages and League endpoints, including the archive foundation.

GitHub Pages does **not** deploy these files. Replacing a file on GitHub changes only the backup/source copy. To change an API, copy the complete matching file into the relevant Apps Script project, save it, then deploy a new web-app version.

## Normal live update

1. Open the relevant Apps Script project.
2. Replace the complete matching source file(s) from this directory.
3. Save.
4. Deploy → Manage deployments → edit the existing Web app → select **New version** → Deploy.

Do not use the archive function in the live project until it has been trialled in a copied Sheet and sandbox API.

## League directory

The **Leagues** tab accepts these original columns in any order:

| League name | Type of league | Place for the data |
|---|---|---|

It also accepts these optional columns in any order:

| Description | Results Template | Schedule | Rules | League ID | Section | Season | Status | Sort order |
|---|---|---|---|---|---|---|---|---|

**League ID** must be a unique, lower-case slug such as open-2026-27. It makes the public link stable:

league.html?league=open-2026-27

The API first looks for that exact ID, then falls back to a case-insensitive League Name lookup so existing shared links keep working.

Defaults for older directory rows are:

| Type | Section | Status |
|---|---|---|
| live | Current | In progress |
| static | Historic | Complete |
| external | Associated | External |

Run **setupLeaguesV1** in a **sandbox copy** to add any missing directory headings and create the empty demonstration rows only when they do not already exist. It does not overwrite an existing league row or existing results tab.

## Live league result entry

Enter one row per board in a live league tab:

- Numeric board values (1, 2, 3 …) count towards the official match score.
- S, S6, S7 etc. are spare boards. They display in match detail but never count in the table.
- A trailing B or W changes the usual Home-player colour convention, for example 1W or S6B.
- The Result is from the Home team/player perspective: 1, 0, or 0.5. The site displays 1–0, 0–1, and ½–½.
- Default codes H and A apply penalty points; HA and AA are agreed-in-advance defaults and carry no penalty.

The current table calculation awards match points according to the league’s settings (normally 2 for a win and 1 for a draw), then applies the implemented game-point and penalty-point tie-breaks. The final two WCCA rule tie-breaks remain a manual decision for now.

## Archive function

**wccaArchiveLeague()** is a manual, public no-argument Apps Script function. It is not accessible from the website or API.

It runs only when the **Settings** tab has both:

| Setting | Value |
|---|---|
| Archive League ID | an exact League ID for a currently live league |
| Archive Confirmation | ARCHIVE |

On success it:

1. calculates standings and match summaries using the existing live calculation;
2. creates unique summary and raw archive tabs;
3. copies source board-level data as plain values to the raw tab;
4. changes the existing directory row to static, Historic, and Complete;
5. clears Archive Confirmation and writes Last archive result.

See [ARCHIVE_OPERATION.md](../ARCHIVE_OPERATION.md) for the sandbox-only trial procedure.
