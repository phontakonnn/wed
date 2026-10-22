# PKH web client

The React + TypeScript + Vite client calls the Fastify API at `/api`; it uses no production mock
data. In development, Vite proxies `/api` to `http://127.0.0.1:3001`. In production, Fastify serves
the built frontend and API from one origin.

## Development (PowerShell)

Use two terminals from the repository root. The username/port in `EXPECTED_ORIGIN` must match the
address used in the browser because the API validates both the `Origin` and `Host` headers.

Terminal 1:

```powershell
$env:DATA_DIR = 'C:\PKH-data'
$env:EXPECTED_ORIGIN = 'http://localhost:5173'
npm.cmd run dev:server
```

Terminal 2:

```powershell
npm.cmd run dev:web
```

Open `http://localhost:5173`. Create the administrator locally first with
`$env:DATA_DIR = 'C:\PKH-data'; npm.cmd run bootstrap:admin` in an interactive terminal. Use a
temporary DATA_DIR for development if the machine does not yet have an approved data directory.

## Production build

```powershell
npm.cmd run build:web
npm.cmd run build:server
$env:DATA_DIR = 'C:\PKH-data'
npm.cmd --prefix apps/server start
```

The server requires the web build at `apps/web/dist` and listens on `127.0.0.1`. It does not bind a
public interface. Remote access is not configured by this application; any later remote access
must follow the approved Tailscale-only policy, never Funnel and never a public port.

## Notes behavior

- Login uses the existing local administrator session.
- Active notes can be created, listed, opened, edited, and soft-deleted.
- Pagination is server-side. Deleted records remain in SQLite and are omitted from the active list.
- The Notes FTS5 index is maintained for future search work; there is no search UI/API in this slice.
