# HTTP API

**Status:** documents only the routes that exist in `apps/server/src/index.ts` as of 2026-10-19.
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

## 3. Deliberately absent endpoints

| Route | Why |
| --- | --- |
| `POST /api/auth/register` | No public signup. Admin creation is CLI-only (`npm run bootstrap:admin`). |
| Password reset / email flows | Not implemented; no mail transport. |
| Notes, bookmarks, tags, files, search | Not implemented yet. |

Requesting `POST /api/auth/register` without a session returns **401**, not 404, because the
default-deny hook runs before routing.

---

## 4. Calling the API from a browser

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

## 5. Environment variables

| Variable | Required | Effect |
| --- | --- | --- |
| `DATA_DIR` | yes for `startServer()` | Absolute path. Database at `DATA_DIR/db/knowledge.sqlite3`. |
| `EXPECTED_ORIGIN` | no | Defaults to `http://127.0.0.1:3001`. Controls CSRF comparison and cookie `Secure`. |
| `PORT` | no | Defaults to `3001`. |
| `NODE_ENV` | no | `test` disables the logger. |

`DATA_DIR` is validated at startup: a missing or relative path aborts the process.
