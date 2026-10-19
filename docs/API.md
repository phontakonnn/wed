# HTTP API

**Status:** documents the routes that exist in `apps/server/src/index.ts` as of 2026-10-19.
**Base URL (local):** `http://127.0.0.1:3001`
**Binding:** `startServer()` always listens on host `127.0.0.1`. There is no remote-access mode.
**Content type:** JSON request and response bodies unless stated otherwise.

---

## 1. Global request rules

### 1.1 CSRF / origin check

Every request whose method is **not** `GET` must satisfy all three conditions, including the
otherwise-public login route:

| Check | Required value |
| --- | --- |
| `Origin` header | Exactly equal to `EXPECTED_ORIGIN` (default `http://127.0.0.1:3001`) |
| `Host` header | Host of `EXPECTED_ORIGIN` |
| `X-PKH-Request` header | Literal `1` |

Any failure returns **403** with `{ "error": "คำขอไม่ผ่านการตรวจสอบแหล่งที่มา" }`.
`GET` requests are not origin-checked, but are still subject to authentication.

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

---

## 2. Endpoints

### `GET /api/health` — public

Liveness probe. Intentionally minimal; no version, path, or configuration disclosure.

**200**
```json
{ "status": "ok", "db": "ready", "uptimeSeconds": 1234.5 }
```

`db` is a static string; the handler does not execute a query against SQLite.

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
removed from active lists and the Notes FTS index. This slice does not yet expose trash listing or
restore.

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

---

## 4. Deliberately absent endpoints

| Route | Why |
| --- | --- |
| `POST /api/auth/register` | No public signup. Admin creation is CLI-only (`npm run bootstrap:admin`). |
| Password reset / email flows | Not implemented; no mail transport. |
| Bookmarks, categories, tags, files | Not implemented yet. |

Requesting `POST /api/auth/register` without a session returns **401**, not 404, because the
default-deny hook runs before routing.

---

## 5. Calling the API from a browser

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

## 6. Environment variables

| Variable | Required | Effect |
| --- | --- | --- |
| `DATA_DIR` | yes for `startServer()` | Absolute path. Database at `DATA_DIR/db/knowledge.sqlite3`. |
| `EXPECTED_ORIGIN` | no | Defaults to `http://127.0.0.1:3001`. Controls CSRF comparison and cookie `Secure`. |
| `PORT` | no | Defaults to `3001`. |
| `NODE_ENV` | no | `test` disables the logger. |

`DATA_DIR` is validated at startup: a missing or relative path aborts the process.

## 7. Proposed file API (design only; not implemented)

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
