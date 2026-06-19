# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A media tracking application with Go backend (Gin + GORM) and React frontend. The system identifies media files (movies/TV shows) via an external identifier service, matches them with TMDB metadata, and tracks them in a MySQL database. Features real-time WebSocket updates, batch upload processing with worker pools, and dual authentication (JWT + API Key).

## Commands

### Backend Development

```powershell
# Build and run the server
go run cmd/server/main.go

# Build binary
go build -o media-tracker.exe cmd/server/main.go

# Install dependencies
go mod download
go mod tidy
```

The server runs on the port specified in `config.yaml` (default: 8082).

### Frontend Development

```powershell
# Development server with hot reload (from web/ directory)
cd web
npm run dev

# Build for production (outputs to cmd/server/web/dist)
npm run build
```

The Vite dev server runs on port 5173 and proxies `/api` requests to `localhost:8082`.

### Database

The application auto-migrates the database schema on startup. Ensure MySQL is running and `config.yaml` is configured with correct database credentials.

## Architecture

### Layered Structure

- **Handler** (`internal/handler/`): HTTP request handlers (Gin controllers)
- **Service** (`internal/service/`): Business logic layer
- **Repository** (`internal/repository/`): Data access layer (GORM)
- **Model** (`internal/model/`): Database models and types
- **Middleware** (`internal/middleware/`): Auth, admin checks, etc.

### Key Components

**Upload Service** (`internal/service/upload.go`):
- Manages async batch upload processing via worker pool
- Configurable concurrency (`config.yaml`: `identifier.concurrency`)
- Each file: check duplicate by SHA256 → call identifier service → save to DB
- WebSocket notifications for progress/completion

**Identifier Service** (`internal/service/identifier.go`):
- Calls external media identification API
- Automatic login/re-login with token management
- HTTP client with connection pooling (20 max conns)
- Returns media metadata + TMDB match

**WebSocket Hub** (`internal/ws/hub.go`):
- Real-time push notifications to connected clients
- One connection per user (replaces old connection on reconnect)
- Auth via JWT token or API Key in query param
- Message types: `new_media`, `upload_progress`, `upload_batch_done`, `upload_error`, `upload_duplicate`, `media_updated`

**Authentication** (`internal/middleware/auth_or.go`):
- `AuthOr()`: Requires either JWT (Bearer token) or API Key (X-API-Key header)
- JWT for user sessions, API Key for programmatic access
- Admin-only routes protected by `AdminOnly()` middleware

### Frontend Structure

- React Router for navigation
- Context API for user state (`context.tsx`)
- API client (`api.ts`) for backend communication
- Tailwind CSS for styling
- WebSocket connection for real-time updates

### Build and Deployment

The Go binary embeds the frontend build:
```go
//go:embed web/dist
var webFS embed.FS
```

Frontend must be built first (`npm run build` in `web/`), then Go build packages it into the binary. The server serves static files and falls back to `index.html` for client-side routing.

## Configuration

`config.yaml` (required at runtime):
- **server**: port, mode (debug/release)
- **database**: MySQL connection details
- **jwt**: secret key, token expiration
- **identifier**: external API URLs, credentials, timeout, concurrency
- **ws**: max WebSocket connections
- **invitation**: registration requires invitation code
- **tmdb**: API key for TMDB integration

Copy `config copy.yaml` as template. The application reads `config.yaml` from the working directory on startup.

## Key Workflows

### Media Upload Flow
1. Client sends file metadata (sha256, size, name, cloud) to `/api/upload` or `/api/upload/batch`
2. Handler submits job(s) to upload service queue
3. Worker picks job → checks duplicate → calls identifier service → saves to DB
4. WebSocket broadcasts `new_media` event to all users
5. Progress updates sent to uploading user

### TMDB Update Flow
1. Admin/authorized user sends new TMDB ID to `/api/media/:id/tmdb`
2. Service generates fake filename `manual_{tmdbid=X}.mp4` and calls identifier
3. Updates media record with new metadata
4. Broadcasts `media_updated` event via WebSocket

## Development Notes

- The server binds to all interfaces (`0.0.0.0`) on the configured port
- Database uses `utf8mb4` charset with `utf8mb4_unicode_ci` collation
- Connection pool: 50 max open, 10 max idle, 1hr max lifetime
- Frontend dev server proxies API requests to avoid CORS issues
- WebSocket endpoint: `/ws?token={jwt_or_apikey}`
- Static files served from embedded FS with SPA fallback routing
