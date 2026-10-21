# Wiltshire Chess Apps Script source

This folder is the version-controlled backup of the live **Wiltshire Chess API** project.

It contains two files:

- `Code.gs` — News and image endpoint.
- `content-extension.gs` — Settings, Clubs, Committee, Pages and Leagues endpoint.

The deployed API is managed in Google Apps Script.  GitHub Pages does **not** deploy these files automatically.

## Updating the live API

1. In Apps Script, open **Wiltshire Chess API**.
2. Replace the matching file(s) with the version from this folder.
3. Save.
4. Run `setupLeaguesV1` once to create the League directory and empty Open/Minor templates.
5. Deploy → Manage deployments → edit the existing Web app → select **New version** → Deploy.

The website reads only the League directory at first.  It fetches a live league's results only when a visitor opens that league.

## Live-league result entry

In each live league tab, enter one row per board:

- Numeric Board values (`1`, `2`, `3` …) count towards the official match score.
- `S` means spare board: it appears in the match detail but is excluded from the match score and league table.
- Result is from the **home team/player** perspective: `W`, `D`, or `L`.

Do not delete the settings rows above the result headings.
