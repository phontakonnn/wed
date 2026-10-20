# HTTP API

**Status:** documents the routes that exist in `apps/server/src/index.ts` as of 2026-10-19.
**Base URL (local):** `http://127.0.0.1:3001`
**Binding:** `startServer()` always listens on host `127.0.0.1`. There is no remote-access mode.
**Content type:** JSON request and response bodies unless stated otherwise.

---

## 1. Global request rules

### 1.1 CSRF / origin check

Every request whose method is **not** `GET` **or `HEAD`** must satisfy all three conditions,
including the otherwise-public login route:

| Check | Required value |
| --- | --- |
| `Origin` header | Exactly equal to `EXPECTED_ORIGIN` (default `http://127.0.0.1:3001`) |
| `Host` header | Host of `EXPECTED_ORIGIN` |
| `X-PKH-Request` header | Literal `1` |

Any failure returns **403** with `{ "error": "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }`.
`GET` and `HEAD` requests are not origin-checked, but are still subject to authentication. `HEAD`
was exempted with the file-download route: it is a safe method that returns metadata only, and
requiring a custom header made it unusable from a browser address bar or a download manager.

### 1.2 Authentication

`preHandler` denies by default. Only these are public:

- `GET /api/health`
- `POST /api/auth/login`

Everything else requires a valid `pkh_session` cookie. A missing, unknown, idle-expired, or
absolute-expired session returns **401** with `{ "error": "กรุณาเข้าสู่ระบบ" }`.

Static frontend files (`/`, `/assets/*`, `/favicon.svg`, and `/icons.svg`) are public when a
production web build is configured. Notes and authentication APIs remain protected as described
here.

On each authenticated request the cookie is re-issued (sliding browser-side lifetime), except on
`POST /api/auth/logout` and `POST /api/auth/logout-all`, which clear it instead.

### 1.3 Session cookie

| Attribute | Value |
| --- | --- |
| Name | `pkh_session` |
| `Path` | `/` |
| `HttpOnly` | always |
| `SameSite` | `Strict` |
| `Max-Age` | `604800` (7 days) |
| `Secure` | only when `EXPECTED_ORIGIN` uses `https:` |

> **Known mismatch:** the cookie lives 7 days, while the server-side session may live up to 30 days
> (`absolute_expires_at`). The browser drops the cookie first unless the user is active.

### 1.4 Error shape

All errors are `{ "error": "<Thai message>" }`. There is no error code field and no stack trace in
responses. Validation failures raised by Fastify's JSON schema return Fastify's default **400**
payload shape.

### 1.5 Login throttling

In-process, per `IP` and per normalized username. Window 15 minutes. After 5 failures, further
attempts receive an exponential delay starting at 1 s and capped at 60 s, returning **429** with a
`Retry-After` header in seconds. State is memory-only: it resets on restart and is not shared
across processes.

### 1.6 Security headers

`@fastify/helmet` is registered globally. Responses include a self-only Content Security Policy
(`default-src 'self'`, `script-src 'self'`, `style-src 'self'`), `frame-ancestors 'none'`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a
deny-all `Permissions-Policy` (`camera`, `microphone`, `geolocation`, `payment`, `usb`). HSTS is
intentionally disabled because the local Fastify listener uses HTTP loopback; if HTTPS termination
is introduced later, its trust and HSTS policy require a separate review. API tests verify header
values; browser compatibility has not been tested.

---

## 2. Endpoints

### `GET /api/health` — public

Liveness probe. Intentionally minimal; no version, path, or configuration disclosure.

**200**
```json
{ "status": "ok", "db": "ready", "uptimeSeconds": 1234.5 }
```

The handler executes `SELECT 1` against SQLite before returning 200. A failed probe is logged
internally and returns **503** with `{ "status": "unavailable", "db": "unavailable" }`; database
errors and paths are not included in the response.

---

### `POST /api/auth/login` — public (CSRF headers required)

**Request**
```json
{ "username": "admin", "password": "correct horse battery staple" }
```

Schema: `additionalProperties: false`; `username` 1–80 chars; `password` 1–1024 chars.
The username is trimmed and NFC-normalized. Lookup uses `COLLATE NOCASE`.

**200**
```json
{ "user": { "id": "<uuid>", "username": "admin" } }
```
`Set-Cookie: pkh_session=<token>; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`

**401** — unknown user or wrong password. Identical body for both, to avoid account enumeration:
```json
{ "error": "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }
```
When the user does not exist, a dummy hash is still verified so the response time does not reveal
whether the account exists.

**429** — throttled:
```json
{ "error": "เข้าสู่ระบบไม่สำเร็จ โปรดลองอีกครั้งภายหลัง" }
```
Header: `Retry-After: <seconds>`

**403** — missing/invalid origin headers.

---

### `GET /api/auth/me` — authenticated

**200**
```json
{ "user": { "id": "<uuid>", "username": "admin" } }
```

**401** if the session is invalid, or if the session's user row no longer exists.

---

### `GET /api/auth/sessions` — authenticated

Lists the caller's sessions, most recently active first.

**200**
```json
{
  "sessions": [
    {
      "id": "<sha256 hex>",
      "device": "Mozilla/5.0 ...",
      "createdAt": 1760000000000,
      "lastSeenAt": 1760000000000,
      "idleExpiresAt": 1760604800000,
      "absoluteExpiresAt": 1762592000000,
      "current": true
    }
  ]
}
```

`id` is the **hash** of the token, not the token itself. It is the identifier used for revocation.
`current` is true for the session making the request.

---

### `DELETE /api/auth/sessions/:sessionId` — authenticated

Revokes one session belonging to the caller. `sessionId` must match `^[a-f0-9]{64}$`.

**204** — no body.
**404** — no matching session for this user: `{ "error": "ไม่พบเซสชัน" }`
**400** — `sessionId` fails the pattern.

Sessions belonging to other users cannot be revoked: the `DELETE` is scoped by `user_id`.

---

### `POST /api/auth/sessions/revoke-others` — authenticated

Revokes every session of the caller except the current one.

**200**
```json
{ "revoked": 3 }
```

---

### `POST /api/auth/logout` — authenticated

Deletes the session identified by the presented cookie and clears the cookie
(`Max-Age=0`).

**200**
```json
{ "ok": true }
```

---

### `POST /api/auth/logout-all` — authenticated

Deletes all sessions of the caller and clears the cookie.

**200**
```json
{ "revoked": 2 }
```

---

## 3. Notes

Every Notes endpoint requires an authenticated session. Each query is scoped to the session
owner; a note owned by another user is returned as **404**, without revealing whether it exists.
All mutating requests (`POST`, `PATCH`, `DELETE`) also require the global CSRF headers in §1.1.

### `GET /api/notes?page=1&pageSize=20`

Returns active notes, most recently updated first. `page` is an integer from 1 to 1,000,000;
`pageSize` is an integer from 1 to 100. Both are optional with the shown defaults.

**200**
```json
{
  "notes": [
    {
      "id": "<uuid>",
      "title": "Idea",
      "content": "Note text",
      "createdAt": 1760871912123,
      "updatedAt": 1760871912123
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

Soft-deleted notes are omitted from both `notes` and `total`.

### `GET /api/notes/search?q=...&page=1&pageSize=50`

Searches the current user's active note titles and content using literal substring matching after
NFC normalization. The route requires a valid session. As a `GET`, it does not require CSRF headers.
Other owners' notes and notes in Trash are excluded from the result and count.

`q` is required, trimmed and NFC-normalized, and limited to 500 characters; empty/whitespace-only
queries and control characters are rejected with **400**. `page` is 1–1,000,000 and defaults to 1.
`pageSize` is 1–200 and defaults to 50. Unknown parameters and invalid ranges return **400**.

- Queries of at least 3 Unicode code points use the separate FTS5 trigram index as a quoted phrase.
  Embedded quotes are escaped and the candidate matches are checked against normalized text.
- Queries of 1–2 Unicode code points use an `instr()` scan over NFC-normalized title/content.
  This path is linear in the owner's active note corpus; it always returns only the requested page.
- Search requests are limited to 60 per client IP per minute after authentication. The 61st
  authenticated request in the window returns **429**, a `Retry-After` header, and
  `{ "statusCode": 429, "error": "ค้นหาบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่" }`.
  Anonymous requests are denied by the session hook and do not consume the authenticated
  requester's limit. The in-process limit resets when the server restarts and is not shared across
  server processes.
- Database/query failures return a generic **500** error without a filesystem path or stack trace.

**200** response shape is the same as `GET /api/notes`:
```json
{
  "notes": [
    {
      "id": "<uuid>",
      "title": "Idea",
      "content": "Note text",
      "createdAt": 1760871912123,
      "updatedAt": 1760871912123
    }
  ],
  "page": 1,
  "pageSize": 50,
  "total": 1
}
```

**401** — missing or invalid session.

The 429 status, response body, and `Retry-After` header are covered by the Vitest API tests.
Synthetic HTTP timing is recorded in `docs/DECISIONS.md`; it is not a production performance
guarantee.

### `GET /api/notes/trash?page=1&pageSize=50`

Returns soft-deleted notes for the current user, most recently moved to trash first. `page` is an
integer from 1 to 1,000,000; `pageSize` is an integer from 1 to 200. Both are optional with the
shown defaults. The response shape is the same as `GET /api/notes`; `total` counts only the current
user's soft-deleted notes.

Unknown query parameters and out-of-range values return **400**. The endpoint requires a session;
it does not expose another user's notes.

### `POST /api/notes`

Creates a note for the current user. The JSON body must contain exactly `title` and `content`.
Title is trimmed and must contain 1–200 characters; content may be empty and is limited to 100,000
characters. Unknown fields are rejected.

**Request**
```json
{ "title": "Idea", "content": "Note text" }
```

**201**
```json
{ "note": { "id": "<uuid>", "title": "Idea", "content": "Note text", "createdAt": 1760871912123, "updatedAt": 1760871912123 } }
```

### `GET /api/notes/:noteId`

Returns one active note belonging to the current user.

- **200** `{ "note": { ... } }`
- **400** when `noteId` is not a UUID.
- **404** when the note is deleted, missing, or belongs to another user.

### `PATCH /api/notes/:noteId`

Updates one or both of `title` and `content`. The body must contain at least one recognized field;
unknown fields are rejected. The same length limits and title trimming as create apply.

**Request**
```json
{ "content": "Revised text" }
```

- **200** `{ "note": { ...updated note... } }`
- **400** for invalid input.
- **404** when the note is deleted, missing, or belongs to another user.

### `DELETE /api/notes/:noteId`

Soft-deletes an owned note by setting `deleted_at` and `updated_at`. The record is retained; it is
removed from active lists and the Notes FTS index.

- **204** — no body.
- **400** for a malformed UUID.
- **404** when the note is already deleted, missing, or belongs to another user.

### `POST /api/notes/:noteId/restore`

Restores a soft-deleted note owned by the current user by clearing `deleted_at`. The existing
database trigger puts the note back into the Notes FTS5 index. No title or content is rewritten.

- **200** `{ "note": { ...restored note... } }`
- **400** for a malformed UUID.
- **404** when the note is active, missing, or belongs to another user.
- **401** without a valid session.
- **403** when the global CSRF/origin check fails.

### `DELETE /api/notes/:noteId/permanent`

Permanently removes a note only when it is already in trash and belongs to the current user. The
request must explicitly confirm the irreversible deletion:

```json
{ "confirm": true }
```

Missing confirmation, `false`, and unknown body properties are rejected with **400**. An active,
missing, or other user's note returns **404** without deletion. Successful deletion returns **204**;
the existing SQLite delete trigger removes the corresponding FTS row in the same statement.
Authentication and CSRF checks apply.

There is no automatic cleanup job. The UI's 30-day retention notice is informational only.

## 4. Bookmarks

Every Bookmarks endpoint requires an authenticated session and scopes all reads and writes to its
owner. Other-owner and missing bookmark IDs both return **404**. All mutating requests require the
global CSRF headers in §1.1. Metadata is entered by the user; the server never fetches bookmark
URLs or follows redirects.

### `GET /api/bookmarks?page=1&pageSize=50`

Returns the current user's bookmarks, ordered by most recently updated first. `page` is 1–1,000,000;
`pageSize` is 1–200. Both are optional; unknown query parameters and invalid ranges return **400**.
The paginated response includes `bookmarks`, `page`, `pageSize`, and owner-scoped `total`.

### `POST /api/bookmarks`

Creates a bookmark. Body fields: required `title` (1–200 characters) and `url` (1–2,048
characters), optional `description` (up to 5,000 characters). Unknown properties are rejected.
Title and URL are trimmed. URL must parse as HTTP or HTTPS and must not contain username/password
credentials; its stored value is normalized by the WHATWG URL parser.

```json
{ "title": "PKH", "url": "https://example.com/guide", "description": "Read later" }
```

Returns **201** with `{ "bookmark": { "id", "title", "url", "description", "createdAt", "updatedAt" } }`.

### `GET /api/bookmarks/:bookmarkId`

Returns an owned bookmark. IDs must match the UUID-like 36-character route validation pattern.
Malformed IDs return **400**; missing and other-owner IDs return **404**.

### `PATCH /api/bookmarks/:bookmarkId`

Updates one or more of `title`, `url`, and `description`. At least one property is required;
validation and URL rules match create. Returns **200** with `{ "bookmark": { ... } }`; returns
**404** for missing or other-owner IDs.

### `DELETE /api/bookmarks/:bookmarkId`

Permanently deletes an owned bookmark and returns **204**. Missing or other-owner IDs return **404**.

## 5. Categories, tags, and note relations

Every route in this section requires an authenticated session. Reads and writes are scoped to that
session owner; mutations also require the CSRF headers in §1.1. Names are trimmed, NFC-normalized,
1–80 Unicode code points, and unique per owner without regard to ASCII case. Unknown body and query
properties are rejected.

### `GET /api/categories?page=1&pageSize=50` and `GET /api/tags?page=1&pageSize=50`

Return an owner-scoped page (`categories` or `tags`) ordered by name, with `page`, `pageSize`, and
`total`. The default page size is 50; the maximum is 200. Invalid pagination returns **400**.

### `POST /api/categories` and `POST /api/tags`

Create a category or tag with `{ "name": "งาน" }`. Returns **201** with `{ "category": { ... } }`
or `{ "tag": { ... } }`. A duplicate name for the same owner returns **409**; invalid names return
**400**.

### `PATCH /api/categories/:itemId` and `PATCH /api/tags/:itemId`

Rename an owned item with `{ "name": "งานด่วน" }`. Returns **200** with the singular item object.
Malformed IDs or invalid names return **400**; a missing or other-owner item returns **404**; a
duplicate name returns **409**. Renaming preserves note relationships.

### `DELETE /api/categories/:itemId` and `DELETE /api/tags/:itemId`

Delete an owned category/tag and its note relationships; returns **204**. Missing or other-owner
IDs return **404**. This operation does not delete notes.

### `GET /api/notes/:noteId/taxonomy`

Returns `{ "categories": [...], "tags": [...] }` for an owned active note. Notes in Trash and notes
owned by another user return **404**.

### `PUT /api/notes/:noteId/taxonomy`

Replace the note's relationships using arrays of owned IDs:

```json
{ "categoryIds": ["<uuid>"], "tagIds": ["<uuid>"] }
```

The note and every referenced category/tag must belong to the current owner. Each array allows at
most 100 unique UUID-like IDs. Validation failures return **400**; a missing, trashed, or other-owner
note returns **404**. The replacement is transactional: invalid references leave existing
relationships unchanged. A successful replacement returns **204**. Soft deletion and restore retain
relationships; permanent note deletion cascades them.

---

## 6. Deliberately absent endpoints

| Route | Why |
| --- | --- |
| `POST /api/auth/register` | No public signup. Admin creation is CLI-only (`npm run bootstrap:admin`). |
| Password reset / email flows | Not implemented; no mail transport. |
| Favorites, files | Not implemented yet. |

Requesting `POST /api/auth/register` without a session returns **401**, not 404, because the
default-deny hook runs before routing.

---

## 7. Calling the API from a browser

```js
await fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-pkh-request': '1',
  },
  credentials: 'same-origin',
  body: JSON.stringify({ username, password }),
});
```

The `Origin` header is set by the browser automatically. Never send credentials cross-origin;
`SameSite=Strict` will suppress the cookie.

---

In Vite development, `/api` is proxied to the loopback Fastify server. Start the server with
`EXPECTED_ORIGIN=http://localhost:5173` and open the web app at exactly `http://localhost:5173`;
the CSRF origin/host checks intentionally remain enabled. In production, Fastify serves the web
build and API from the same origin.

## 8. Environment variables

| Variable | Required | Effect |
| --- | --- | --- |
| `DATA_DIR` | yes for `startServer()` | Absolute path. Database at `DATA_DIR/db/knowledge.sqlite3`. |
| `EXPECTED_ORIGIN` | no | Defaults to `http://127.0.0.1:3001`. Controls CSRF comparison and cookie `Secure`. |
| `PORT` | no | Defaults to `3001`. |
| `NODE_ENV` | no | `test` disables the logger. |
| `BACKUP_ENCRYPTION_KEY` | no | Canonical Base64 for a 32-byte AES-256-GCM key. When configured, new backups and restore safety copies are encrypted; needed to verify/restore encrypted backups. |
| `BACKUP_ENCRYPTION_REQUIRED` | no | Set to `true` to fail backup creation and restore if the key is missing or malformed; there is no plaintext fallback in required mode. |

`DATA_DIR` is validated at startup: a missing or relative path aborts the process.

## 9. Proposed file API (design only; not implemented)

> **Superseded for the MVP routes.** The streaming single-request upload, `GET`/`HEAD`/`DELETE`
> file routes, Range handling and filename rules are implemented; see §11. The Tus resumable
> upload routes (`/api/uploads/*`), 10 GiB limit, and PDF preview policy in this section remain
> unimplemented design. Read §11 for the contract that actually exists.

This section is a proposal based on §6 of `MASTER_PROMPT.md`; none of these routes, headers, or
behaviors exist in the current server. It must not be treated as an implemented contract.

### 7.1 Shared security and storage rules

- Every route requires a valid authenticated session and is default-deny. The owner is derived only
  from that session; client-supplied owner IDs, filesystem paths, object keys, and storage locations
  are never trusted.
- Every mutating method (`POST`, `PATCH`, and `DELETE`) requires the global Origin, Host, and
  `X-PKH-Request: 1` checks in §1.1. `HEAD` and `OPTIONS` also require authentication; `OPTIONS`
  must satisfy the current global non-GET CSRF/origin checks. Do not enable cross-origin CORS as
  part of this design.
- The browser/client filename is metadata only. The storage name is an internally generated UUID;
  the client filename is never concatenated into a path.
- Upload content is streamed to `DATA_DIR/tmp/<upload-uuid>.part`; final objects are stored at
  `DATA_DIR/objects/<first-two-uuid-characters>/<uuid>`. Both directories must be on the same
  volume so rename can be atomic. Hash SHA-256 as bytes arrive; enforce the configured size limit,
  request/idle timeout, abort handling, and disk-space reserve before accepting data.
- `MAX_UPLOAD_BYTES` is 10 GiB per file and the proposed server-wide concurrent upload limit is two,
  following the Master Prompt defaults. Before accepting an upload, available space after the
  declared size must remain at least `max(10 GiB, 5% of the destination volume)`. These values must
  be verified on a disposable test volume; they are not evidence of safe capacity on every host.
- Flush the completed temporary file, call `fsync` where supported/appropriate, atomically rename
  it into the object shard, and only then commit the file metadata row. Do not hold a SQLite write
  transaction open while the client streams bytes.
- A bounded Defender/file-lock retry with backoff may be used for transient rename failures; never
  disable Defender and never retry forever.

### 7.2 Proposed protocol and routes

The recommended protocol choice is Tus 1.0.0 for resumable uploads, using a Fastify-integrated Tus
handler for files larger than 1 GiB in phase 4. The library/dependency proposal and reasons are in
`DECISIONS.md`; no package has been installed or approved. The exact route adapter and dependency
approval remain implementation gates.

For MVP files of at most 1 GiB, propose a streaming single-request route:

#### `POST /api/files` — authenticated, CSRF protected

Request body is the raw file byte stream (`application/octet-stream` or a validated declared media
type); do not buffer the request body or use a JSON/base64 payload. Required headers:

| Header | Proposed contract |
| --- | --- |
| `X-File-Name` | UTF-8 filename percent-encoded once; decoded once by the server, NFC-normalized, and validated by the filename rules below. |
| `Content-Length` | Required declared size in bytes; positive integer no greater than 1 GiB and no greater than `MAX_UPLOAD_BYTES`. Reject missing, malformed, oversized, or inconsistent lengths. Files greater than 1 GiB use Tus in phase 4. |
| `Content-Type` | Untrusted hint only; never use it alone to permit inline preview. |

The server must preflight declared size and free-space reserve before accepting the body. Apply a
bounded request timeout and an inactivity timeout; exact timeout values are implementation
configuration to be settled and tested before coding, not silently invented here. On successful
stream, hash and size are verified, the file is fsynced and atomically renamed, and
the metadata row is committed. **201** returns `{ "file": { "id", "name", "size", "sha256",
"mediaType", "createdAt" } }`. Invalid metadata/size is **400/413**; insufficient reserved disk
space is **507**; timeout is **408**; request abort does not create a completed row; unexpected
storage/DB failure returns a generic Thai **500** without a path or stack trace. Errors must be
logged with a request/upload ID and failure stage, never file contents or credentials.

#### `POST /api/uploads` — authenticated, CSRF protected; Tus creation for files larger than 1 GiB

Use Tus protocol headers (`Tus-Resumable: 1.0.0`, `Upload-Length`, and `Upload-Metadata`). The
server must reject lengths at or below 1 GiB on this route if the policy reserves it for large
files, as well as lengths over 10 GiB. `Upload-Metadata` is untrusted, bounded input; parse the
`filename` value, validate/normalize it, and ignore any client-provided owner, path, or storage
key. The authenticated user ID is inserted server-side.

On success return **201** with an opaque, unpredictable upload URL and `Upload-Offset: 0`,
`Upload-Length`, `Tus-Resumable`, and `Upload-Expires`. Persist an upload-session row before
returning the URL. The ID is a random UUID v4 and is not an authorization token: every operation
also checks the current authenticated owner.

#### `HEAD /api/uploads/:uploadId` — authenticated

Returns the current `Upload-Offset`, `Upload-Length`, `Tus-Resumable`, and `Upload-Expires`.
Unknown, expired, malformed, or other-owner IDs return a non-enumerating **404**. The route never
reveals whether another user's upload ID exists.

#### `PATCH /api/uploads/:uploadId` — authenticated, CSRF protected

Accept Tus `application/offset+octet-stream`, `Upload-Offset`, and `Tus-Resumable`. Verify owner,
unexpired session, exact current offset, declared remaining length, and per-upload exclusivity
before writing. A wrong offset returns **409** with the authoritative `Upload-Offset`; concurrent
PATCH requests for the same upload return **409** (not interleaved writes). A Tus checksum extension
should be enabled and its checksum verified before advancing the durable offset; the extension
requires at least the protocol's `sha1` algorithm. Independently compute the required whole-object
SHA-256 at finalization. A failed chunk checksum must discard that chunk and leave the offset
unchanged. Recheck global disk
reserve and the overall size limit. Return **204** with the new offset and expiry only after the
chunk is durable and its offset has been committed.

When the offset reaches the declared length, stream-verify the complete SHA-256, fsync, atomically
rename the temporary object, and commit the `files` row and completed upload state. Return the
standard successful Tus response only after finalization is durable. Repeated final PATCH requests
must not create duplicate file rows or overwrite an object.

#### `DELETE /api/uploads/:uploadId` — authenticated, CSRF protected

Proposed Tus termination behavior: an owner may explicitly cancel their own incomplete upload.
Return **204** after marking it cancelled and safely removing its temporary bytes. Another user's
upload returns **404** and is untouched. If the file is actively being written, first stop/abort
and join the writer before cleanup.

#### `GET /api/files/:fileId` and `HEAD /api/files/:fileId` — authenticated

Resolve the file ID and owner before opening or sending any byte. Missing and other-owner IDs both
return **404**. Never map a request path directly to the object path; derive the shard and object
name from the validated database UUID. Set `X-Content-Type-Options: nosniff` on every file
response. Use the server-detected media type, not the upload's claimed `Content-Type`.

For a single valid `Range: bytes=...` request, stream only that byte interval and return **206**
with correct `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`; do not send the entire
file. For unsatisfiable ranges return **416** with `Content-Range: bytes */<size>`. Malformed or
unsupported multiple ranges must be rejected consistently (proposed **416**, with the same
unsatisfied-range header); this policy must be covered by tests. No Range request returns **200**.
HEAD returns headers without body. The route must not leak partial file bytes before authorization.

### 7.3 Windows filename and content policy

- Decode the declared filename exactly once; reject invalid UTF-8/percent encoding, empty names,
  `.`/`..`, control characters, `/`, `\`, colon/alternate data stream syntax, and any path
  separator. Do not strip separators and then accept the remainder.
- Normalize the accepted display filename to Unicode NFC and store only the normalized display
  name in metadata. NFC and NFD spellings therefore normalize to the same display string. Do not
  use the display name in any filesystem path.
- Reject Windows device basenames case-insensitively, including extensions: `CON`, `PRN`, `AUX`,
  `NUL`, `COM1`–`COM9`, and `LPT1`–`LPT9` (for example, `CON.txt`). Reject trailing dots/spaces.
- Limit names to 255 UTF-16 code units after NFC normalization; this is a component-level display
  limit, not a storage-path limit. Long absolute paths never come from the client and are never
  constructed from filenames.
- Do not impose uniqueness on display names. Names colliding only by case, or that become equal
  after NFC normalization, remain distinct file records and distinct UUID objects; the UI may
  disambiguate them using creation time or an ID suffix.
- Determine preview type by server-side content inspection and a conservative allowlist. Proposed
  inline preview types: JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MP3, OGG, and WAV. PDF remains an
  attachment until sandbox/CSP and origin-isolation behavior is explicitly reviewed. HTML, SVG,
  unknown types, and all other non-allowlisted formats always use
  `Content-Disposition: attachment`; never render active content on the app origin.

### 7.4 Expiration, recovery, errors, and orphan policy

- Proposed incomplete-upload idle expiry: 24 hours since last durable chunk; proposed absolute
  expiry: 7 days after creation. Return `Upload-Expires`; expired IDs return **410** when retained
  as expired metadata, otherwise **404**. These are design defaults, not implemented values.
- On startup, reconcile `.part` files, object files, and `files` rows. Log each discrepancy with
  the opaque ID and category. Never automatically delete an orphan object or a metadata row.
  Expired `.part` cleanup is allowed only after proving no active writer and no live resumable
  upload session references it; log the cleanup decision. Preserve unexpected `.part` and object
  files for operator inspection.
- File renamed successfully but DB transaction fails: leave the UUID object as a logged orphan;
  do not automatically delete it. Reconciliation can identify it for an explicit recovery action.
- DB metadata commit reports failure after object rename: query by generated file/upload ID to
  determine whether the transaction committed despite a lost/ambiguous response. If not present,
  preserve the orphan. If present, return the durable result on a safe retry.
- DB row exists but object is absent (for example, later disk loss or an ambiguous crash): return a
  generic storage error without bytes, log the missing-object ID, and mark for reconciliation.
  The chosen rename-before-DB sequence prevents the ordinary DB-first partial state but cannot
  prevent later media damage.
- For disk-full, abort, timeout, hash mismatch, lock, and DB failures, never return a success-shaped
  response. Do not create a completed metadata row or expose a partial object. A resumable PATCH
  failure leaves the durable offset unchanged; only cleanup code proven to own an inactive expired
  temporary file may remove it.

## 10. Favorites (implemented)

Favorites are owner-scoped and polymorphic over notes and bookmarks. The owner always comes from
the session; no request body, query parameter, or path segment can select another owner.

| Method and path | Behavior |
| --- | --- |
| `GET /api/favorites?page&pageSize` | Paginated list (default 50, maximum 200). Items are `{ itemType, itemId, title, subtitle, createdAt, updatedAt }`. `subtitle` is the note content or the bookmark URL. Only favorites whose target is still visible are returned: a note in the trash and a deleted bookmark are hidden. |
| `GET /api/favorites/:itemType/:itemId` | `{ "favorited": true \| false }`. `itemType` must be `note` or `bookmark` (schema **400** otherwise). |
| `PUT /api/favorites/:itemType/:itemId` | Idempotent add, **204**. **404** when the target does not exist, belongs to another user, or is a note already in the trash. |
| `DELETE /api/favorites/:itemType/:itemId` | **204** when removed, **404** when no such favorite exists for this owner. |

Lifecycle rules:

- Soft-deleting a note keeps its favorite row, so restoring the note restores the favorite without
  a second request. The list hides it while it is trashed.
- Permanently deleting a note, deleting a bookmark, or deleting the user removes the favorite rows
  through SQLite triggers and foreign keys.
- Adding the same favorite twice does not create duplicates or change `createdAt`.

## 11. Files (implemented)

Files are stored on local disk under `DATA_DIR/objects`; metadata is in SQLite. See
`ARCHITECTURE.md` for the storage layout and `SCHEMA.md` §9 for the table. File routes require
`DATA_DIR`; without it they return **503**.

### 11.1 `POST /api/files`

Streaming single-request upload. The request body is the raw file (`Content-Type:
application/octet-stream`); it is never buffered in memory or encoded as JSON/base64.

| Header | Contract |
| --- | --- |
| `X-File-Name` | Filename percent-encoded exactly once. The server decodes once, normalizes to NFC, and validates. |
| `Content-Length` | Required positive integer. Missing, zero, or non-integer values return **411**. |
| `Content-Type` | Must be `application/octet-stream`; the declared media type is not trusted for storage. |

Limits and preconditions:

- `MAX_UPLOAD_BYTES` (default 1 GiB, `1073741824`) caps a single file. Larger declarations return
  **413**.
- At most 2 uploads may be in flight; a third returns **429**.
- Free space must remain at least `max(MAX_UPLOAD_BYTES, 5% of the volume)` after the declared
  size; otherwise **507**.
- Filenames containing `/`, `\`, `:`, control characters, or other Windows-invalid characters are
  rejected with **400**, as are `.`/`..`, trailing dot or space, names longer than 255 UTF-16 code
  units, and reserved device basenames with or without an extension (`CON`, `CON.txt`, `NUL`,
  `COM1`–`COM9`, `LPT1`–`LPT9`, `PRN`, `AUX`). Invalid names are rejected, never repaired.
- Empty files and byte counts that differ from `Content-Length` return **400**.
- The bytes are written to `DATA_DIR/tmp/<uuid>.part`, hashed with SHA-256 while streaming,
  fsynced, then renamed to `DATA_DIR/objects/<first two id characters>/<uuid>`. The metadata row is
  inserted only after the rename. A failed upload leaves no metadata row and no object.

Success is **201** with:

```json
{ "file": { "id": "<uuid>", "displayName": "report.pdf", "sizeBytes": 1234,
  "sha256": "<64 hex>", "mediaType": "application/pdf", "createdAt": 1760000000000,
  "downloadUrl": "/api/files/<uuid>" } }
```

If the object rename succeeds but the metadata insert fails, the object is kept and logged as an
orphan (never auto-deleted) and the response is a generic Thai **500**.

### 11.2 `GET` and `HEAD /api/files/:fileId`

Owner-scoped: a missing ID and another user's ID both return **404**. Bytes are only opened after
that check. If the metadata row exists but the object file is missing, the response is a generic
**500** (`ไม่สามารถเข้าถึงไฟล์ได้ในขณะนี้`) and the discrepancy is logged; no path is returned.

Response headers:

| Header | Value |
| --- | --- |
| `Content-Type` | Server-detected from magic bytes; never the upload's declared type |
| `X-Content-Type-Options` | `nosniff` |
| `Content-Disposition` | `inline` only for JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, MP3, OGG, WAV; `attachment` for everything else, including HTML, SVG, PDF and unknown bytes |
| `Accept-Ranges` | `bytes` |
| `Cache-Control` | `private, no-store` |

Range handling for a single range:

- No `Range` → **200** with the full body.
- `bytes=start-end`, `bytes=start-`, `bytes=-suffix` → **206** with `Content-Range` and only that
  interval.
- Start at or beyond the end, or a zero suffix → **416** with `Content-Range: bytes */<size>`.
- Malformed values and multiple ranges (`bytes=0-1,3-4`) → **416** as well; ranges are never
  silently collapsed.

`HEAD` returns the same headers with no body. It is not origin/CSRF-checked (see §1.1) but still
requires a session.

### 11.3 `DELETE /api/files/:fileId`

Deletes the metadata row first, then the object; **204** on success, **404** for a missing or
other-owner ID. If the object was already absent, the row is still removed and the discrepancy is
logged.

### 11.4 `GET /api/files?page&pageSize`

Paginated metadata list (default 50, maximum 200), newest first, each item including
`downloadUrl`. Owner-scoped. No search, preview generation, or resumable-upload state exists.

## 12. Life OS (implemented)

All routes below require a session cookie and, for anything other than `GET`/`HEAD`, the same CSRF
rules as §1.1 (`Origin` + `Host` + `X-PKH-Request: 1`). Every response is owner-scoped: a row that
belongs to another account is reported as **404**, never **403**. Text fields are NFC-normalized and
control-character-rejected before they reach SQLite; a rejected value returns **400**.

### 12.1 People

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/people?page=1&pageSize=50&group=family&q=…` | Paginated list, ordered by relationship group then name. `pageSize` ≤ 100. `q` matches name, role, likes, allergies, gifts and memo with `nfc()` + `instr()`. |
| `POST` | `/api/people` | **201** `{ person }`. Requires `name` (1–120) and `relationshipGroup` (`family` \| `partner` \| `friend`). |
| `GET` | `/api/people/:personId` | `{ person }` or **404**. |
| `PATCH` | `/api/people/:personId` | Partial update of any writable field; `{ person }` or **404**. |
| `DELETE` | `/api/people/:personId` | **204**; `note_people` rows cascade and `reminders.linked_person_id` becomes `NULL`. |
| `GET` | `/api/people/:personId/notes` | Notes linked through `note_people`, newest first. |

Writable person fields: `name`, `relationshipGroup`, `roleLabel` (≤ 80), `avatarFileId`,
`avatarPreset` (≤ 40), `birthdayOrAnniversary` (empty or `YYYY-MM-DD`), `phone` (≤ 40),
`favoritesAndLikes`, `allergiesAndMedical`, `giftIdeasAndSizes` (each ≤ 4000), `memo` (≤ 8000).
`avatarFileId` must be a `files` row owned by the same account, otherwise **400**; the
`people_avatar_owner_*` triggers enforce the same rule at the storage layer.

### 12.2 Reminders

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/reminders` | All reminders for the account, ordered by `target_date`. |
| `GET` | `/api/reminders/upcoming?days=60` | Incomplete reminders whose `target_date` falls within `days` (default 60) of today; powers the bell badge. |
| `POST` | `/api/reminders` | **201** `{ reminder }`. Requires `title` and an ISO `targetDate`. |
| `PATCH` | `/api/reminders/:reminderId` | Partial update including `isCompleted`; `{ reminder }` or **404**. |
| `DELETE` | `/api/reminders/:reminderId` | **204** or **404**. |

`category` is one of `birthday`, `anniversary`, `health`, `backup`, `other`. `priority` is `low`,
`normal` (default) or `high`. `notifyDaysBefore` is clamped to 0–365. `linkedPersonId` must be a
person owned by the caller, otherwise **400**; an invalid or missing `targetDate` is **400**.

### 12.3 Timeblocks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/timeblocks?date=YYYY-MM-DD` | Blocks for one day, ordered by `time_range`. Defaults to today. |
| `POST` | `/api/timeblocks` | **201** `{ timeblock }`; requires `timeRange`, `title` and `lifeArea`. |
| `PATCH` | `/api/timeblocks/:blockId` | Partial update including `isDone`. |
| `DELETE` | `/api/timeblocks/:blockId` | **204** or **404**. |

`lifeArea` is `health`, `focus_work`, `family`, `growth` or `other`. `timeRange` is display text
such as `06:30 - 07:30`; the server does not parse it and does not reject overlaps.

### 12.4 Habits

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/habits` | All habits, oldest first. |
| `POST` | `/api/habits` | **201** `{ habit }`; requires `title`, optional `dailyTarget` (1–1000) and `unit`. |
| `PATCH` | `/api/habits/:habitId` | Partial update of `title`, `dailyTarget`, `unit`. |
| `POST` | `/api/habits/:habitId/check` | Increments `current_count` by one, capped at `daily_target`, and updates `streak_days`. |
| `DELETE` | `/api/habits/:habitId` | **204** or **404**. |

The streak rule: checking on the next calendar day adds one, checking twice on the same day leaves
it unchanged, and a gap resets it to 1. Comparison is done on ISO date strings, so the server does
not apply a timezone.

### 12.5 Command-palette search

`GET /api/search?q=…&limit=8` returns `{ notes, people, reminders, query }`. `limit` is 1–20 per
group. Notes are matched on title and content, people on name, role, likes, allergies, gifts and
memo, and reminders on title and category — all through `nfc()` + `instr()` so Thai text, mixed
scripts and NFD input behave the same as the notes search in §3. Soft-deleted notes are excluded.

### 12.6 Taxonomy extension

`GET /api/notes/:noteId/taxonomy` now also returns `people: [{ id, name, roleLabel }]`, and
`PUT /api/notes/:noteId/taxonomy` accepts an optional `personIds` array that replaces the note's
person links inside the same transaction as categories and tags. An unknown or other-owner person
id returns **404** and leaves every relation unchanged.

## 13. Work core (implemented)

Inbox, tasks, projects and goals. Same session, CSRF and owner rules as §1.1 and §12: a row owned by
another account is **404**, never **403**; text is NFC-normalized and control-character-rejected;
dates are `YYYY-MM-DD` or **400**.

### 13.1 Inbox

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/inbox?status=new\|triaged\|archived\|all&page&pageSize` | Defaults to `new`. Returns `{ items, total, newCount }`; `newCount` drives the sidebar badge. |
| `POST` | `/api/inbox` | **201** `{ item }`. Requires `body` (1–4000). `kind` is inferred as `url` when the body is a bare http(s) URL, otherwise `text`. |
| `PATCH` | `/api/inbox/:itemId` | Partial `body`, `kind`, `status`. |
| `DELETE` | `/api/inbox/:itemId` | **204** or **404**. |
| `POST` | `/api/inbox/:itemId/convert` | **201** `{ item, target, targetId }`; marks the item `triaged` in the same transaction. |

`convert` body: `{ target: 'note'|'task'|'project'|'bookmark'|'reminder', title?, url?, targetDate? }`.

- `note` → a note whose title is the first line and whose content is the full original body.
- `task` → a `todo` task; `project` → an `active` project; `reminder` → a reminder (defaults to today
  when `targetDate` is omitted).
- `bookmark` requires a body or `url` starting with `http://`/`https://`, otherwise **400** and the
  item stays `new`.
- Converting an already converted item returns **409**; an archived item returns **409**. The inbox
  row keeps the original text forever.

### 13.2 Tasks

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/tasks?status=open\|todo\|doing\|waiting\|done\|cancelled\|all&due=today\|overdue\|week\|none&projectId&goalId&page&pageSize` | `status` defaults to `open` (todo/doing/waiting). Returns `{ tasks, total, today }`. |
| `GET` | `/api/tasks/today` | `{ today, overdue, dueToday, upcoming }`; `upcoming` is the next 7 days, capped at 20. |
| `POST` | `/api/tasks` | **201** `{ task }`. |
| `GET` | `/api/tasks/:taskId` | `{ task, checklist }`. |
| `PATCH` | `/api/tasks/:taskId` | `{ task, nextTask }`. |
| `DELETE` | `/api/tasks/:taskId` | **204** or **404**. |
| `POST` | `/api/tasks/:taskId/checklist` | **201** `{ item }`; `position` defaults to the next free slot. |
| `PATCH` | `/api/tasks/:taskId/checklist/:itemId` | `{ item }`; accepts `title` and `isDone`. |
| `DELETE` | `/api/tasks/:taskId/checklist/:itemId` | **204** or **404**. |

Writable task fields: `title`, `detail`, `status`, `priority` (`low|normal|high|urgent`), `dueDate`,
`startDate`, `projectId`, `goalId`, `personId`, `recurrence` (`none|daily|weekly|monthly|yearly`).
A `projectId`/`goalId`/`personId` owned by another account is **400**.

**Recurrence:** when a PATCH moves a task into `done` and it has a non-`none` recurrence with a due
date, the server inserts the next occurrence (daily +1, weekly +7, monthly/yearly clamped to the
month length) and returns it as `nextTask`. Re-saving an already-done task returns
`nextTask: null`, so the operation is idempotent. `completedAt` is set on entry to `done` and cleared
when the task leaves it.

Checklist items are owner-scoped through their parent task; a foreign task id is **404**.
Completing every checklist item does **not** change the parent task's status.

### 13.3 Projects

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/projects?status=active\|planned\|paused\|done\|archived\|all&page&pageSize` | Defaults to `active`. Each row carries `taskTotal` and `taskDone`. |
| `POST` | `/api/projects` | **201** `{ project }`; requires `name`. |
| `GET` | `/api/projects/:projectId` | `{ project }` or **404**. |
| `PATCH` | `/api/projects/:projectId` | `{ project }`; moving to `done` stamps `completedAt`, moving away clears it. |
| `DELETE` | `/api/projects/:projectId` | **204**; its tasks survive with `project_id = NULL`. |
| `GET` | `/api/projects/:projectId/tasks` | All tasks in the project, due-date order. |

The UI percentage is `taskDone / taskTotal`; the server returns the raw counts and never a score.

### 13.4 Goals

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/goals?status=active\|achieved\|dropped\|all` | Defaults to `active`; each row includes `progressPercent` and `activeProjects`. |
| `POST` | `/api/goals` | **201** `{ goal }`; requires `title`. |
| `PATCH` | `/api/goals/:goalId` | `{ goal }`; `currentValue` is how progress moves. |
| `DELETE` | `/api/goals/:goalId` | **204** or **404**. |

`progressPercent` is `null` unless `targetValue` is a number greater than zero — a goal without a
measurable target never shows a percentage. When present it is clamped to 0–100.

### 13.5 Unified search

`GET /api/search` (documented in §12.5) now also returns `tasks`, `projects` and `goals`, matched on
their title/name plus detail/description/outcome/metric with the same `nfc()` + `instr()` approach.
All groups stay owner-scoped.

## 14. Dashboard (implemented)

`GET /api/dashboard` — one owner-scoped aggregate for the home view. No query parameters.

```json
{
  "today": "2026-10-20",
  "counts": {
    "dueToday": 1, "overdue": 0, "openTasks": 3, "reminders": 0, "inbox": 2,
    "projects": 1, "goals": 2, "habitsOutstanding": 1, "notes": 5,
    "upcomingWindowEnd": "2026-10-27"
  },
  "tasks": { "dueToday": [ ... ], "overdue": [ ... ] },
  "reminders": [ ... ],
  "timeblocks": { "blocks": [ ... ], "done": 1, "total": 3 },
  "projects": [ ... ],
  "goals": [ ... ],
  "habits": [ ... ],
  "inbox": { "newCount": 2, "items": [ ... ] },
  "notes": [ { "id": "...", "title": "...", "updatedAt": 0 } ]
}
```

Rules the endpoint guarantees:

- Every query is filtered by `owner_id` taken from the session; there is no client-supplied owner
  parameter to spoof.
- `tasks.dueToday` = `due_date = today` and not done/cancelled; `tasks.overdue` = `due_date < today`
  and not done/cancelled. Both cap at 20 rows.
- `timeblocks` counts only `block_date = today`.
- `goals[].progressPercent` is `null` unless `target_value > 0`; no percentage is invented.
- `projects[].taskTotal` / `taskDone` are raw `COUNT`s, so the UI can label the percentage honestly.
- `habits` lists only habits that have not reached `daily_target` today or were not checked today.
- `reminders` covers the next 60 days and excludes completed ones (cap 8).
- `notes` is the five most recently updated, non-deleted notes.
- An empty account returns the same shape with empty arrays and zero counts, so the UI never has to
  distinguish "no data" from "broken response".

## 15. Habit history (implemented)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/habits/:habitId/check` | Increments today's log by one, capped at `daily_target`. Returns `{ habit, log }`. Idempotent once the target is reached. |
| `PUT` | `/api/habits/:habitId/logs/:logDate` | Sets the exact count for one day (`{ count }`). `0` deletes the log. Used for corrections and for filling in a past day inside the tracking window. |
| `GET` | `/api/habits/:habitId/history?from&to&days` | One habit: `{ habit, days, logs, summary }`. `days` defaults to 30, max 400. |
| `GET` | `/api/habits/history?days=7` | Every habit's recent series in one request, so the UI never fires N queries. |

Rules:

- `count` must be an integer ≥ 0 and ≤ 100000. `0` removes the row rather than storing a zero.
- A `logDate` after today returns **400**; a `logDate` before the habit's `trackingStartDate` returns
  **400** as well.
- `days[]` entries for dates before `trackingStartDate` carry `count: null` and `metTarget: null`.
  They are **not** reported as zero, because the system did not observe those days.
- `summary` contains `daysTracked`, `daysLogged`, `daysMetTarget`, `currentStreak`, `bestStreak`, and
  `weekly` / `monthly` blocks computed from the same logs.
- `habit.currentCount` and `habit.streakDays` are derived from the logs; `legacyCurrentCount` and
  `legacyStreakDays` preserve the pre-migration counters.

## 16. Reminder recurrence and snooze (implemented)

`POST /api/reminders` and `PATCH /api/reminders/:reminderId` accept an optional
`recurrence` (`none|daily|weekly|monthly|yearly`). A non-`none` value also stores
`recurrenceAnchorDate` = the target date at creation.

`PATCH` now returns `{ reminder, rolledTo }`:

- Completing a **recurring** reminder advances `targetDate` to the next occurrence, keeps
  `isCompleted` at 0, stamps `lastCompletedAt` and clears `snoozedUntil`. `rolledTo` is the new date;
  no second row is created.
- Completing a **one-off** reminder sets `isCompleted = 1` and `rolledTo: null`.

`POST /api/reminders/:reminderId/snooze`

```json
{ "days": 1, "from": "2026-10-20" }
```

- `days` is 1–30; the UI offers +1 day, +3 days and +1 week.
- `from` is the date the client believes is current. If it no longer matches the effective date the
  request returns **409** with the current `reminder`, which is what makes a retry safe.
- The response is `{ reminder, snoozedFrom, snoozedUntil }`.
- Snoozing a completed reminder returns **409**.
- The effective date is `snoozedUntil ?? targetDate` and is what `/api/reminders/upcoming` uses.

## 17. Dashboard additions

`GET /api/dashboard` now also returns, for each habit in `habits[]`:

- `trackingStartDate`, `legacyCurrentCount`, `legacyStreakDays`
- `weekLogged` and `weekMetTarget`, computed by one grouped query over `habit_logs` for the last
  seven days.

Each reminder now carries `recurrence`, `snoozedUntil` and `effectiveDate`, so the dashboard can show
a snoozed reminder on its real date instead of its original one.

## 18. Entity file links (implemented)

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/entities/:entityType/:entityId/files` | `{ files }` with `displayName`, `mediaType`, `sizeBytes`, `linkedAt`. |
| `POST` | `/api/entities/:entityType/:entityId/files` | `{ fileId }` → **201** `{ files, created: true }`, or **200** `{ files, created: false }` when the link already exists (idempotent). |
| `DELETE` | `/api/entities/:entityType/:entityId/files/:fileId` | **204**; removes the link only. |

`entityType` is one of `note`, `task`, `project`, `person`, `bookmark`; anything else is **400**.
A missing or other-owner entity/file is **404**. The response never contains `object_key`, the object
path or `sha256`.

## 19. Search filters (implemented)

`GET /api/search` accepts three optional parameters in addition to `q` and `limit`:

- `types` — comma-separated subset of `notes,tasks,projects,goals,people,reminders,bookmarks,files`.
  An unknown value returns **400**.
- `from` / `to` — ISO dates. A malformed date (including `2026-13-01`) returns **400**, and
  `from > to` returns **400**.
- Date filtering applies to notes (updated), tasks/projects/goals (due date), reminders (effective
  date) and bookmarks/files (created). `people` has no date and is never date-filtered.
- Files are matched on `display_name` and `media_type` only — **there is no content extraction**, and
  the API must not be described as searching inside PDFs or images.
- Library entries (`notes.kind = 'reference'`) are **not** implemented yet, so they are not a filter
  value. Vault is out of scope until D-1 is decided.
