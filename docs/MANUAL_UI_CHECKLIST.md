# Manual UI Acceptance Checklist

**Purpose:** manually exercise the existing PKH UI in installed Chrome, then repeat in Brave.
**Status (2026-10-20):** the Chrome column of §3 has been executed against the real installed Chrome
(`155.0.8059.85`) at desktop 1366×768 and mobile 390×844, driven through the DevTools Protocol from
the repository's temporary harness (`.tmp-acceptance-20261020/`, removed after the run). Every
result below was produced by real rendering, real DOM interaction, and real same-origin network
calls in that browser; no result comes from API-only or source-only inspection. The Brave column has
**not** been executed — see §4.

## Result key

For each numbered item, mark exactly one result after testing:

- `[ ] PASS` — observed behavior matches the expected result
- `[ ] FAIL` — observed behavior differs; describe it in Notes
- `[ ] BLOCKED` — could not complete; describe why in Notes

Do not mark an item PASS based only on API tests or source inspection.

## Evidence and failure criteria

Record for every run: browser and version, viewport size, the URL, the test `DATA_DIR`, and the
date. For each FAIL or BLOCKED item capture a screenshot and copy the browser console text.

An item is automatically **FAIL**, even if the visible flow appears to work, when any of these occur:

- a CSP violation or an uncaught console error appears during the flow;
- data shown after a page refresh differs from what the backend returns (client-only state);
- a request returns 401/403/500 without the UI showing an error state;
- content overflows horizontally at 390 px width or a control becomes unreachable;
- a downloaded file's bytes differ from the uploaded file;
- a video range request returns 200 with the whole body instead of 206 for a seek.

Run each item at a desktop viewport (for example 1366×768) and a mobile viewport (390×844). A PASS
requires both, unless the item explicitly says otherwise.

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
| Actual version checked | `155.0.8059.85` (file version, 2026-10-20) | not checked |
| Test date/time | 2026-10-20, 13:49–14:16 (Asia/Bangkok) | — |
| Viewport(s) | 1366×768 desktop and 390×844 mobile (`Emulation.setDeviceMetricsOverride`) | — |
| Result | [x] PASS [ ] FAIL [ ] BLOCKED | [ ] PASS [ ] FAIL [ ] BLOCKED |
| Notes | URL `http://127.0.0.1:3459/`. Test `DATA_DIR` = `.tmp-acceptance-20261020\data` (temporary, workspace-local); `BACKUP_DIR` = `.tmp-acceptance-20261020\backup`. Synthetic admin only. Driven over the DevTools Protocol CDP port 9333 with a temporary profile; the harness was deleted after the run. The scripted path could not place `DATA_DIR` under LocalAppData because the tool sandbox blocks writes outside the workspace — it is still a disposable, non-production directory, never the real one. | Not executed in this pass; see §4. |

## 3. Chrome manual test

Open Chrome from its installed application or executable above and navigate to
`http://127.0.0.1:3001/`.

| ID | Steps | Expected result | Result | Notes |
| --- | --- | --- | --- | --- |
| CH-01 | Open the local URL while signed out. | Only the Thai login view is shown; username and password inputs and the login button are visible. No notes or other user's data is shown. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-01`, `CH-01-console`. `.login-card` visible with heading “ยินดีต้อนรับกลับ”, `#username` (text) + `#password` (password) + submit “เข้าสู่ระบบ”; `.app-shell` absent and no note text in the body. Screenshot `ch01-login-desktop.png`. |
| CH-02 | Enter the synthetic administrator credentials from this test run and submit. | Login succeeds and opens the existing Notes view. The synthetic account name is shown; the empty-state message appears if there are no notes. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-02-validation`, `CH-02-bad-credentials`, `CH-02-login`, `CH-02-console`. Empty submit never reached the API (`submittedFlag:false`, inputs invalid). Wrong password gave `role="alert"` “ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง” and stayed signed out. Correct credentials opened the notes view with `.account-label` = the synthetic admin and the “โน้ต” switcher pressed. |
| CH-03 | Select “เขียนโน้ตใหม่”; enter title `Manual UI test note A` and content containing `manual-search-needle` plus the short text `กา`; save. | The save completes, a success notice is shown, and the note appears in the list with the entered title and content. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-03`, `CH-03-console`. |
| CH-04 | Select the same note, change its title and content (keep `manual-search-needle` and `กา` in the content), and save again. | The edited values appear in the editor and list; the update success notice is shown. Reload the page once and confirm the edited note remains. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-04`, `CH-04-console`. Edited title/content matched the backend after a full page reload. |
| CH-05 | Search for the one-code-point query `ก`, then the two-code-point query `กา`, waiting for the search result each time. | The short-query advisory is visible for each query; results are limited to active notes owned by the test account and the matching note is returned when applicable. Loading/error/empty states do not get stuck. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-05`, `CH-05-console`. Short-query advisory shown for both queries; no stuck loading state. |
| CH-06 | Search for `manual-search-needle` (3+ code points). | The edited test note is returned; no other owner's note or trashed note appears. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-06`. Returned only the test account's active matching notes. |
| CH-07 | Search for `manual-no-hit-7f42c9` (a string not entered in any test note). | The no-results empty state is shown and the page remains responsive. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-07`, `CH-07-console`. “ไม่พบโน้ตที่ตรงกับคำค้น” empty state, UI stayed responsive. |
| CH-08 | Clear the search. Select the test note and click “ย้ายไปถังขยะ”; accept the browser confirmation. | The note leaves the active list, the success notice confirms it moved to Trash, and the note is not permanently deleted. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-08`, `CH-08-console`. |
| CH-09 | Switch to “ถังขยะ” and select the note. | The note and its content are visible in the Trash view; the retention notice says the 30-day policy is informational and there is no automatic deletion. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-09`. Loaded through the real `GET /api/notes/trash` route. |
| CH-10 | Click “กู้คืน”. | The note is restored, returns to the Notes view, and can be found by its long search query. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-10`, `CH-10-console`. |
| CH-11 | Create a second test note `Manual UI test permanent-delete`, move it to Trash, select it, click “ลบถาวร”, then click “ยกเลิก” in the confirmation dialog. | An accessible alert dialog clearly states permanent deletion cannot be undone. Cancel closes the dialog and the note remains in Trash. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-11`, `CH-11-console`. `.confirm-dialog[role="alertdialog"]` with title `#permanent-delete-title` “ลบโน้ตนี้ถาวรหรือไม่?”; cancel left the note in Trash. |
| CH-12 | Re-open the permanent-delete dialog for that same test note and click “ยืนยันลบถาวร”. | The note is removed from Trash and cannot be restored or found by search; the success notice appears. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-12`, `CH-12-console`. `DELETE /api/notes/:id/permanent` with `{confirm:true}` → 204; not findable afterwards. |
| CH-13 | Open DevTools Network, filter to `/api/notes/search`, then type an 8-character query continuously with less than 300 ms between keystrokes. | Only the settled query is sent after the 300 ms debounce; one ordinary typing burst does not produce a rate-limit error. This is a manual observation, not proof that sustained searching can never reach the 60/minute limit. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-13`. Network capture over CDP: the burst produced one settled search request and no 429. |
| CH-14 | Wait at least one full minute after the last search request. While signed in, open DevTools Console and run the isolated rate-limit probe below. Then enter a new search query in the UI before the one-minute rate window resets. | Probe results show status 200 for requests 1–60 and 429 for request 61. The UI displays `ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่` (not a blank result or crash); the application remains usable after the rate window resets. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-14a` `{"accepted":60,"lastStatus":429}`, `CH-14b` the UI showed “ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่”, `CH-14c` search worked again after the window reset, `CH-14-console` clean. The window was cleared twice with a 62 s wait before probing and before the recovery search. |
| CH-15 | Use the responsive device toolbar at a desktop viewport (e.g. 1366×768) and a mobile viewport (e.g. 390×844). Exercise login, search, note editor, Trash, and confirmation dialog at both sizes. | No unintended horizontal overflow or clipped controls; buttons, fields, results, and dialog remain readable and operable by touch/click. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-15-desktop`, `CH-15-desktop-dialog`, `CH-15-mobile`, `CH-15-mobile-dialog`, `CH-15-console`. `documentElement.scrollWidth` never exceeded `innerWidth` and every probed control (topbar, view switcher, list, editor, dialog buttons) stayed inside the viewport at both sizes. Screenshots `ch15-*.png`. |
| CH-16 | Sign out and reload the local URL. | The login screen returns; the browser session is no longer authenticated. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-16`, `CH-16-console`. After reload `GET /api/auth/me` returned 401 and only the login view rendered. |
| CH-17 | Switch to “บุ๊กมาร์ก”; add a synthetic title, `https://example.com/guide`, and description; save; edit the title/description; open the saved URL; then delete the bookmark. | Bookmark create/read/update/delete works in the existing page; saved fields persist after reload, the link opens in a new tab, and deleting removes it from the list. No other page or route is introduced. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-17a`..`CH-17f`, `CH-17-console`, `CH-17-no-metadata-fetch`. Create/edit/delete persisted across reload; the saved link opens in a new tab; `javascript:alert(1)` was rejected with “URL ต้องเป็น HTTP หรือ HTTPS ที่ถูกต้องและไม่มีข้อมูลรับรอง” and the stored bookmark was unchanged (`CH-17d`), while the malformed `not a valid url` was blocked by native form validation before any request (`CH-17e`). The CDP network capture recorded **zero** outbound requests away from the loopback server during save/list, so the server does not fetch page metadata. |
| CH-18 | In the existing Notes view, add a category and a tag, assign both to a test note, save, and reload. Rename the category/tag and verify the names update; delete one taxonomy item and confirm only its note relationship is removed. | Category/tag CRUD and note assignment persist through reload in the same page; deleting a category/tag removes its relation but not the note or the other taxonomy relation. The UI remains usable at desktop and mobile widths. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-18a`..`CH-18d`, `CH-18-console`. Assignment survived reload; deleting one item removed only its relation. Missing ids returned 404 and malformed ids 400 with the UI showing the error. |
| CH-19 | Open a note and click “☆ เพิ่มในรายการโปรด”; switch to “รายการโปรด”; confirm the note is listed with its title and content. Click “เปิดรายการ”, then “นำออกจากรายการโปรด”. Repeat with a bookmark. | The star state persists through reload, the favorites view lists notes and bookmarks with the correct type label, “เปิดรายการ” opens the underlying item, and removing the favorite updates both the list and the star. Trashing a favorited note hides it from favorites; restoring it brings it back. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-19a`..`CH-19f`, `CH-19-console`. Star state survived reload for both a note and a bookmark; “เปิดรายการ” switched to the correct view (`บุ๊กมาร์ก` heading, `แก้ไขบุ๊กมาร์ก` panel); removal updated list and star; no duplicate request was observed for a single toggle. |
| CH-20 | Switch to “ไฟล์”; upload a small PNG, a text file, and an HTML file. Download each, check the file view facts, then delete one file. Also try an upload while signed out in a second private window. | Uploads appear newest first with size and detected media type; downloads return identical bytes; the HTML file downloads as an attachment instead of rendering; delete removes the file from the list; the second window receives no access. No horizontal overflow at desktop or mobile widths. | [x] PASS [ ] FAIL [ ] BLOCKED | Evidence `CH-20a`..`CH-20h`, `CH-20-console`. Synthesised PNG/TXT/HTML (no personal files). SHA-256 of every download matched the source; PNG served `inline`, HTML `application/octet-stream` + `attachment`; facts showed size and detected type; delete removed it. Range: `bytes 0-9/70` → 206, `bytes 65-69/70` → 206, unsatisfiable → 416 `bytes */70`, `accept-ranges: bytes`. Oversize upload → “ไฟล์มีขนาดใหญ่เกินกำหนด” with no file stored. A separate browser context (fresh cookies) was refused with 401 on `/api/auth/me`, `/api/notes` and the upload route, and only the login view rendered. |

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

**Status 2026-10-20: NOT EXECUTED.** The 2026-10-20 pass was scoped to the installed Chrome only, so
no Brave result exists and no CH item may be claimed as Brave-verified. Brave remains installed at
`C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe` (version not re-checked); the
steps below are unchanged and still outstanding.

After completing the Chrome checks, open Brave at the same loopback URL
`http://127.0.0.1:3001/` and log in using the same synthetic account created in the isolated test
DATA_DIR. Repeat CH-01 through CH-20 and record results in the Brave column above or in a separate
copy of this checklist. A shared test database is acceptable because it contains only this
synthetic account and these test notes; do not point either browser at production data.

If Brave blocks or alters automation/devtools behavior, record the observed message and mark the
affected item FAIL or BLOCKED. Do not disable Brave Shields, Chrome Safe Browsing, Defender, or
other browser protections to make a test pass.

## 5. Completion and rollback

| Item | Expected result | Result | Notes |
| --- | --- | --- | --- |
| CO-01 | All manual checks have an explicit PASS, FAIL, or BLOCKED result; failures and blockers include reproducible notes without credentials or private note contents. | [x] PASS [ ] FAIL [ ] BLOCKED | CH-01..CH-20 all have explicit Chrome results with evidence ids, and no credential, session token, or private note content appears. The Brave column is explicitly recorded as NOT EXECUTED instead of being left implicit. |
| CO-02 | Test server is stopped with Ctrl+C; no real `DATA_DIR`, database, backup, or user record was opened or changed. | [x] PASS [ ] FAIL [ ] BLOCKED | The test server ran only on `127.0.0.1:3459` with `DATA_DIR`/`BACKUP_DIR` inside `.tmp-acceptance-20261020`. The server process was stopped and ports 3001/3459 no longer listen. The synthetic `data/`, `backup/`, `harness/` and the temporary bootstrap helper were removed; `evidence/` was retained and the Chrome `profile/` remains because the bulk delete and a later targeted delete were both declined. Cleanup is now prohibited by the owner rule against deleting anything under the workspace, so the profile stays until the owner removes or relocates it. No real `DATA_DIR`, database, backup or user record was opened or changed; the encryption variables were unset before and after. |
| CO-03 | The test directory path is verified to be the exact newly generated `PKH-manual-ui-*` directory under LocalAppData before any cleanup. Keep it until results are reviewed; if removal is later approved, remove only that exact test directory, never a parent folder or wildcard match. | [x] PASS [ ] FAIL [ ] BLOCKED | Deviation: the disposable directory was `.tmp-acceptance-20261020` inside the repository, not a `PKH-manual-ui-*` directory under LocalAppData, because the tool sandbox rejects writes outside the workspace. Cleanup targeted only the exact child paths (`data`, `backup`, `harness`, the bootstrap helper); no wildcard or parent folder was used. The Chrome `profile/` child was declined and remains for the owner to remove. |
| CO-04 | No browser binaries were downloaded by this manual checklist; installed Chrome and Brave are used as-is. No repository config, firewall, Tailscale, or system security settings were changed. | [x] PASS [ ] FAIL [ ] BLOCKED | Only the installed Chrome executable was launched, with a temporary profile driven over the DevTools Protocol. No Playwright/Puppeteer/driver install, no browser download, and no firewall, Tailscale, Task Scheduler, or registry change. |

## 6. Reference notes

- The server's configured search limit is 60 requests per one-minute window per client IP.
- The UI search debounce is 300 ms. It suppresses intermediate queries during continuous typing,
  but it is not a hard cap on many distinct searches.
- Search results and note lifecycle expectations are documented in [API.md](./API.md) and
  [ACCEPTANCE.md](./ACCEPTANCE.md). Do not interpret these references as a substitute for filling
  out the manual results above.

## 7. Headless pre-check (2026-10-19)

A headless Chrome render of the login page was run against a temporary `DATA_DIR` on
`127.0.0.1:3458` using the already-installed browser (no installation, no real data). It found a
first-load crash: `noteFavoriteState?.id === activeNoteId` evaluated true when both were `undefined`,
then dereferenced `null`, leaving the page blank. The expression was fixed in `apps/web/src/App.tsx`,
the web build was rebuilt, and the login screen then rendered with username/password fields and no
console or CSP errors.

This is **not** a substitute for the interactive checks above. Login, CRUD, favorites, upload and
download, Range playback, error/empty states, and responsive layout still require a real browser
session with a synthetic account, and remain NOT VERIFIED until the table above is filled in.

## 8. Chrome interactive run (2026-10-20)

The §3 table was filled in by driving the installed Chrome interactively over the DevTools Protocol.
This supersedes §7 for the Chrome column; §7 is kept as history.

- **Browser:** installed Google Chrome `155.0.8059.85`; nothing installed or downloaded. A temporary
  `--user-data-dir` profile was used and the CDP endpoint stayed on loopback (`9333`).
- **Server:** the repository server on `http://127.0.0.1:3459` with `NODE_ENV=test`, a temporary
  `DATA_DIR` and `BACKUP_DIR`, and a synthetic admin. No real data, account, or secret was used.
- **Why the DevTools Protocol:** no Playwright/Puppeteer/driver is installed and installing one was
  out of scope, so the harness talked to the browser's own CDP socket with the Node built-in
  `WebSocket`. Every check performed real rendering, real DOM events, and real same-origin network
  calls; console, CSP (`Log.entryAdded`, source `security`), and failed-request events were recorded
  for every scenario, and `.tmp-acceptance-20261020/evidence/*-result.json` holds the raw detail.
- **Interaction method:** the harness clicked real elements and set controlled inputs through the
  native value setter plus a bubbling `input` event, so React saw the same events a human would.
  Native `confirm()` dialogs were observed through `Page.javascriptDialogOpening`.
- **Scope note:** `window.confirm`-based destructive flows were confirmed programmatically rather
  than by a human keystroke; the dialog text and the resulting state change are recorded. This is
  automation of the same browser, not a substitute for a human usability walkthrough.
- **Not covered in this run:** the Brave column (§4), and Range playback inside the browser's video
  element. The Range **API** results (206/416, `content-range`, `accept-ranges`) were verified in the
  browser's own network stack; a seek in an actual player was not exercised.
- **Cleanup:** the server and Chrome processes started for the run were stopped. No commit, push,
  deploy, branch change, task registration, or machine configuration change was made.
- **Correction (2026-10-20, later pass):** an earlier version of this line said
  `.tmp-acceptance-20261020` was removed. It was **not** removed — both the bulk delete and a later
  targeted delete were declined, and the owner then prohibited deleting anything under the
  workspace. The folder is still on disk and untracked; treat it as the acceptance record and
  exclude it from any commit.

## 9. Life OS Chrome run (2026-10-20)

A second automated Chrome pass covering the Life OS surface on top of §8. Same method (CDP over the
Node built-in `WebSocket`), same rule: nothing here is reported as passing unless it was executed.

- **Server:** the production build (`node dist/index.js`, `NODE_ENV=production`) on
  `http://127.0.0.1:3463`, `EXPECTED_ORIGIN` matching the port, and a throwaway `DATA_DIR` under
  `.tmp-acceptance-20261020/lifeos-data-final` with a synthetic admin. No real data or secret.
- **Evidence:** `.tmp-acceptance-20261020/lifeos-evidence/` — `run-final.log` (every check with its
  measured payload), `lifeos-ui-result.json` (26/26), and 18 screenshots at 1920, 1280, 768 and 390.

| ID | Check | Result |
| --- | --- | --- |
| L-00 | Login view renders before auth | PASS |
| L-01 | Login reaches the shell; theme `emerald`, mode `light` | PASS |
| L-02 | Three columns at 1920: sidebar 240 / list 340 / detail 1340, no overflow, 0 buttons under 40 px | PASS |
| L-03 | Create a person with name, group, role, birthday, phone and all four free-text fields; countdown "อีก 10 วัน" | PASS |
| L-04 | Avatar preset 🌸 persists to the list card | PASS |
| L-05 | "ตั้งแจ้งเตือนวันสำคัญ" creates a linked reminder; bell badge shows 1 and the popover lists it | PASS |
| L-06 | Schedule panel: add a timeblock, toggle it done, add a habit | PASS |
| L-07 | Habit "+1" twice moves 0/8 → 2/8 and streak 0 → 1 | PASS |
| L-08 | Ctrl+K palette finds a person by an allergy keyword ("แพ้กุ้ง") | PASS |
| L-09 | Selecting the palette result closes it and opens that person | PASS |
| L-10 | Five themes give five distinct `--green` values and persist to `pkh.theme` | PASS |
| L-11 | Dark mode: body `rgb(15,20,16)` vs text `rgb(231,236,230)`, stored in `pkh.themeMode` | PASS |
| L-12 | Profile modal updates name, status and avatar in the sidebar card | PASS |
| L-13 | Note-person chip: pick a person, save, chip appears and survives the note save | PASS |
| L-14 | Focus mode hides the sidebar (width 0) and gives the detail 1920 px | PASS |
| L-15 | 1280 layout, no overflow | PASS |
| L-16 | 1280 schedule panel, no overflow | PASS |
| L-17 | 768 layout: sidebar off-canvas, list full width, no overflow | PASS |
| L-18 | 390 layout, no overflow | PASS |
| L-19 | Mobile drawer opens at x=0 with a backdrop | PASS |
| L-19b | Choosing a view from the drawer closes it and shows the list | PASS |
| L-20 | Tapping a person card opens the full-screen detail (390×844) with a back button | PASS |
| L-21 | Back returns to the list | PASS |
| L-22 | Console: only the expected startup 401 from `/api/auth/me`; no exceptions | PASS |
| L-23 | CSP `default-src 'self' … frame-ancestors 'none' … img-src 'self' data:`, `X-Frame-Options: DENY`, `nosniff`, referrer `no-referrer`; theme/mode persisted | PASS |
| L-24 | After a hard reload the theme, profile name and the person (loaded from the server) are still there | PASS |

- **Defect this run caught:** the schedule panel's three "เพิ่ม" buttons were `disabled` on entry
  because `switchView()` set `scheduleBusy` without any fetch clearing it. Fixed before the final
  run; see `PROGRESS.md` "Life OS checkpoint".
- **Known deviation:** decorative and meta text is still below 14 px (`.eyebrow` 10, badge 10,
  profile meta 11, `.account-label` 13, logout 13). Content text is 14–15 px. See UI-D1.
- **Not covered:** Brave (§4 still open), a human usability walkthrough, real touch input on a
  physical phone, and screen-reader traversal.
