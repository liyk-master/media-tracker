# Media Tracker

## Build

```sh
# Frontend + backend (in order)
cd web && npm run build && cd ../cmd/server && go build .

# Dev — frontend only (Vite proxies /api -> :8082)
cd web && npm run dev
```

Vite builds into `cmd/server/web/dist/`. The Go binary embeds it via `//go:embed`.

## Structure

```
cmd/server/main.go     — entrypoint, wires everything
internal/
  config/              — YAML config load
  model/               — GORM models (User, Media, Invitation, ExportLog)
  repository/          — DB access layer (GORM)
  service/             — business logic (auth, upload, identify)
  handler/             — Gin handlers (auth, media, admin, upload, tmdb, user)
  middleware/          — JWT/API key auth, AdminOnly, CanEditTMDB
  ws/                  — WebSocket hub for upload progress
  pkg/                 — shared utilities (jwt, response)
web/src/
  pages/               — DashboardPage, AdminPage, TmdbDetailPage, DetailPage
  components/          — UploadForm
  api.ts               — typed fetch wrapper, WS connection
  context.tsx          — auth context (token, role, logout)
```

## Key conventions

- **Table naming**: GORM `SingularTable: true` (table = `media`, not `medias`)
- **Auth**: `AuthOr()` middleware requires JWT Bearer or X-API-Key header. Admin routes add `AdminOnly()`.
- **JSON column**: `model.JSON` is a custom type wrapping `json.RawMessage`. Its `Scan` method copies bytes from the MySQL driver buffer (pointer aliasing bug — must `make+copy`).
- **SPA routing**: `r.NoRoute` catch-all serves `index.html` for client-side paths.
- **Media library is public**: No user_id filtering on list queries.

## Gotchas

- `ListMediaGrouped`: raw SQL group-by query — JSON_EXTRACT for year filter on MySQL JSON column.
- Backend caps `page_size` at 100 in `media.go`.
- Frontend `page_size=100`, epg list paginated at 50 per page.
- Export logging runs in a goroutine after response is sent.
