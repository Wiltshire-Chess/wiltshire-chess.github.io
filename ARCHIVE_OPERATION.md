# Archive operation — sandbox trial only

Do this only after completing [PREVIEW_SETUP.md](PREVIEW_SETUP.md). It changes the connected spreadsheet, so the first trial must use the copied sandbox Sheet and **WCCA Website Sandbox API**, never the live WCCA workbook/API.

The archive function is deliberately manual. It does not run from the website and it cannot use a League Name as a target.

## Before starting

In the sandbox **Leagues** tab, make sure the league row has:

- **Type of league:** live
- **Place for the data:** the exact source-results tab name
- **League ID:** a unique lower-case slug such as open-2026-27

The source result tab remains untouched after a successful archive.

## Trial steps

1. In the sandbox Sheet’s **Settings** tab, add or replace this value:

   | Setting | Value |
   |---|---|
   | Archive League ID | the exact ID, for example open-2026-27 |

2. Add or replace this second value:

   | Setting | Value |
   |---|---|
   | Archive Confirmation | ARCHIVE |

   It must be capital letters exactly.

3. In the sandbox Apps Script project, use the top function drop-down (beside **Run**) to select **wccaArchiveLeague**, then click **Run**. Approve access only for the sandbox project if Google asks.

4. Check the sandbox Sheet. A successful run creates:

   - a unique **Archive …** summary tab with a frozen-record note, a TABLE section and a RESULTS section;
   - a unique **Archive Raw …** tab containing the original board-by-board result rows as plain values;
   - an updated original League-directory row: type static, source set to the summary tab, Section Historic, Status Complete;
   - a blank Archive Confirmation and a Last archive result message in Settings.

5. Redeploy a new version of the **sandbox** Apps Script web app, then open the preview site. The league should now appear in **Historic competitions** and display its frozen static table and match results.

6. Before another trial, clear or replace the sandbox test data. The function will never overwrite an existing archive tab, so a repeat run creates a new uniquely named pair of archive tabs. It never deletes the original live tab and never creates the next season automatically.

## If it stops with an error

- A blank/unknown League ID, a non-live league, or a confirmation other than exactly ARCHIVE stops before any archive tabs are created.
- If an unexpected Apps Script error occurs after tabs have appeared, stop and inspect the sandbox Sheet before retrying. The function will not overwrite those tabs, but a retry will make a new uniquely named archive pair.
- This archive uses the website’s existing calculation logic. Any WCCA tie-break not yet automated must be resolved in the source results before treating the frozen table as final.

There is no production rollback operation in this branch. The safety model is: trial on copied data first, inspect the resulting tabs, and only later decide whether the function should be copied into the live Apps Script project.
