# Manual UI Acceptance Checklist

**Purpose:** manually exercise the existing PKH UI in installed Chrome, then repeat in Brave.
**Status:** prepared only; no browser UI checks have been performed. Leave every result blank until
the operator runs the test.

## Result key

For each numbered item, mark exactly one result after testing:

- `[ ] PASS` — observed behavior matches the expected result
- `[ ] FAIL` — observed behavior differs; describe it in Notes
- `[ ] BLOCKED` — could not complete; describe why in Notes

Do not mark an item PASS based only on API tests or source inspection.

## 1. Test safety and environment

Use only a new, disposable test directory and a synthetic administrator. Never point `DATA_DIR` at
the production directory or a directory containing existing user information. Do not use real
passwords, notes, bookmarks, files, or account details. The service must remain bound to loopback;
do not change firewall, Tailscale, registry, or browser security settings.

Open a new PowerShell terminal at the repository root and run:

```powershell
$env:PKH_MANUAL_RUN_ID = [guid]::NewGuid().ToString('N')
$env:DATA_DIR = Join-Path $env:LOCALAPPDATA "PKH-manual-ui-$env:PKH_MANUAL_RUN_ID"
$env:EXPECTED_ORIGIN = 'http://127.0.0.1:3001'
$env:PORT = '3001'

if (Test-Path -LiteralPath $env:DATA_DIR) {
  throw "Refusing to reuse an existing test directory: $env:DATA_DIR"
}

Write-Output "Test DATA_DIR: $env:DATA_DIR"
```

Check that the printed directory is under the current user's LocalAppData and is a newly generated
`PKH-manual-ui-*` path. Keep the same PowerShell process open so the environment variables remain
set. Then build the local application, create a synthetic administrator interactively, and start
the source server (which binds to `127.0.0.1` and serves the built web assets):

```powershell
npm.cmd run build:server
npm.cmd run build:web
npm.cmd run bootstrap:admin
npm.cmd run dev:server
```

During bootstrap, choose a synthetic username and a new test-only password of at least 12
characters. The password prompt is hidden. Do not reuse or record a real password. Keep the server
terminal running. In a second PowerShell window, verify only the local health endpoint:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
```

Expected result: the response reports `status: ok` and `db: ready`; the browser URL used below is
`http://127.0.0.1:3001/`. If startup or health fails, mark the relevant checklist item BLOCKED and
record the exact non-sensitive error; do not try another DATA_DIR that might contain real data.

## 2. Environment record

Record the environment used for each browser run. These are observations from the read-only machine
check on 2026-10-19; re-check the version if the browser has since updated.

| Field | Chrome | Brave |
| --- | --- | --- |
| Executable path | `C:\Program Files\Google\Chrome\Application\chrome.exe` | `C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe` |
| Observed executable version | `155.0.8059.85` | `155.1.97.59` |
| Actual version checked | ____________________ | ____________________ |
| Test date/time | ____________________ | ____________________ |
| Viewport(s) | ____________________ | ____________________ |
| Result | [ ] PASS [ ] FAIL [ ] BLOCKED | [ ] PASS [ ] FAIL [ ] BLOCKED |
| Notes | ____________________ | ____________________ |

## 3. Chrome manual test

Open Chrome from its installed application or executable above and navigate to
`http://127.0.0.1:3001/`.

| ID | Steps | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| CH-01 | Open the local URL while signed out. | Only the Thai login view is shown; username and password inputs and the login button are visible. No notes or other user's data is shown. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-02 | Enter the synthetic administrator credentials from this test run and submit. | Login succeeds and opens the existing Notes view. The synthetic account name is shown; the empty-state message appears if there are no notes. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-03 | Select “เขียนโน้ตใหม่”; enter title `Manual UI test note A` and content containing `manual-search-needle` plus the short text `กา`; save. | The save completes, a success notice is shown, and the note appears in the list with the entered title and content. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-04 | Select the same note, change its title and content (keep `manual-search-needle` and `กา` in the content), and save again. | The edited values appear in the editor and list; the update success notice is shown. Reload the page once and confirm the edited note remains. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-05 | Search for the one-code-point query `ก`, then the two-code-point query `กา`, waiting for the search result each time. | The short-query advisory is visible for each query; results are limited to active notes owned by the test account and the matching note is returned when applicable. Loading/error/empty states do not get stuck. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-06 | Search for `manual-search-needle` (3+ code points). | The edited test note is returned; no other owner's note or trashed note appears. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-07 | Search for `manual-no-hit-7f42c9` (a string not entered in any test note). | The no-results empty state is shown and the page remains responsive. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-08 | Clear the search. Select the test note and click “ย้ายไปถังขยะ”; accept the browser confirmation. | The note leaves the active list, the success notice confirms it moved to Trash, and the note is not permanently deleted. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-09 | Switch to “ถังขยะ” and select the note. | The note and its content are visible in the Trash view; the retention notice says the 30-day policy is informational and there is no automatic deletion. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-10 | Click “กู้คืน”. | The note is restored, returns to the Notes view, and can be found by its long search query. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-11 | Create a second test note `Manual UI test permanent-delete`, move it to Trash, select it, click “ลบถาวร”, then click “ยกเลิก” in the confirmation dialog. | An accessible alert dialog clearly states permanent deletion cannot be undone. Cancel closes the dialog and the note remains in Trash. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-12 | Re-open the permanent-delete dialog for that same test note and click “ยืนยันลบถาวร”. | The note is removed from Trash and cannot be restored or found by search; the success notice appears. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-13 | Open DevTools Network, filter to `/api/notes/search`, then type an 8-character query continuously with less than 300 ms between keystrokes. | Only the settled query is sent after the 300 ms debounce; one ordinary typing burst does not produce a rate-limit error. This is a manual observation, not proof that sustained searching can never reach the 60/minute limit. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-14 | Wait at least one full minute after the last search request. While signed in, open DevTools Console and run the isolated rate-limit probe below. Then enter a new search query in the UI before the one-minute rate window resets. | Probe results show status 200 for requests 1–60 and 429 for request 61. The UI displays `ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่` (not a blank result or crash); the application remains usable after the rate window resets. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-15 | Use the responsive device toolbar at a desktop viewport (e.g. 1366×768) and a mobile viewport (e.g. 390×844). Exercise login, search, note editor, Trash, and confirmation dialog at both sizes. | No unintended horizontal overflow or clipped controls; buttons, fields, results, and dialog remain readable and operable by touch/click. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CH-16 | Sign out and reload the local URL. | The login screen returns; the browser session is no longer authenticated. | [ ] PASS [ ] FAIL [ ] BLOCKED | |

Rate-limit probe for CH-14 (run only against this temporary local test server while logged in):

```javascript
(async () => {
  const statuses = [];
  for (let i = 0; i < 61; i += 1) {
    const response = await fetch(`/api/notes/search?q=manual-429-probe-${i}`, {
      cache: 'no-store',
    });
    statuses.push(response.status);
  }
  console.log({
    accepted: statuses.slice(0, 60).filter((status) => status === 200).length,
    lastStatus: statuses[60],
  });
})();
```

Expected console summary: `accepted: 60`, `lastStatus: 429`. The one-minute window must be clear
before running this probe; earlier search requests from the same client IP count toward the limit.
This probe sends only synthetic search strings; it does not create or modify notes. It uses the
authenticated browser's same-origin session. Wait for the one-minute rate window to reset before
continuing with ordinary searches.
Do not run this against any non-test service or from another network-accessible address.

## 4. Repeat in Brave

After completing the Chrome checks, open Brave at the same loopback URL
`http://127.0.0.1:3001/` and log in using the same synthetic account created in the isolated test
DATA_DIR. Repeat CH-01 through CH-16 and record results in the Brave column above or in a separate
copy of this checklist. A shared test database is acceptable because it contains only this
synthetic account and these test notes; do not point either browser at production data.

If Brave blocks or alters automation/devtools behavior, record the observed message and mark the
affected item FAIL or BLOCKED. Do not disable Brave Shields, Chrome Safe Browsing, Defender, or
other browser protections to make a test pass.

## 5. Completion and rollback

| Item | Expected result | Result | Notes |
| --- | --- | --- | --- |
| CO-01 | All manual checks have an explicit PASS, FAIL, or BLOCKED result; failures and blockers include reproducible notes without credentials or private note contents. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CO-02 | Test server is stopped with Ctrl+C; no real `DATA_DIR`, database, backup, or user record was opened or changed. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CO-03 | The test directory path is verified to be the exact newly generated `PKH-manual-ui-*` directory under LocalAppData before any cleanup. Keep it until results are reviewed; if removal is later approved, remove only that exact test directory, never a parent folder or wildcard match. | [ ] PASS [ ] FAIL [ ] BLOCKED | |
| CO-04 | No browser binaries were downloaded by this manual checklist; installed Chrome and Brave are used as-is. No repository config, firewall, Tailscale, or system security settings were changed. | [ ] PASS [ ] FAIL [ ] BLOCKED | |

## 6. Reference notes

- The server's configured search limit is 60 requests per one-minute window per client IP.
- The UI search debounce is 300 ms. It suppresses intermediate queries during continuous typing,
  but it is not a hard cap on many distinct searches.
- Search results and note lifecycle expectations are documented in [API.md](./API.md) and
  [ACCEPTANCE.md](./ACCEPTANCE.md). Do not interpret these references as a substitute for filling
  out the manual results above.
