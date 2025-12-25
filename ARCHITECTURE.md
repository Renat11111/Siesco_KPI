# Siesco KPI - Project Architecture

## 1. Tech Stack
- **Backend:** PocketBase (Go) - embedded in `main.go`.
- **Frontend:** Wails -> React + TypeScript + Vite.
- **Protocol:** Frontend talks to Backend via standard PocketBase JS SDK (`http://127.0.0.1:8090`), NOT via Wails bindings.

## 2. Key Features & Implementation

### A. Dynamic Statuses
- **Source of Truth:** `config.json` in the root.
- **Sync Logic:** On `main.go` startup, the app reads `config.json` and upserts records into the `statuses` collection in DB.
- **Frontend:** `DailyStats.tsx` and `TaskUpload.tsx` fetch valid statuses from DB.
- **Design:** Colors are stored as semantic names ("success", "warning") and mapped to HEX via `frontend/src/lib/colors.ts`.

### B. Dynamic Task Fields
- **Source of Truth:** `config.json` in the root (section `task_fields`).
- **Sync Logic:** On `main.go` startup, the app reads `config.json` and populates/updates the `task_fields` collection in DB **only if the collection is new or empty**. Subsequent changes in `config.json` will NOT overwrite existing records in the DB, allowing manual management via Admin UI. `time_spent` is guaranteed to be present.
- **Frontend:** `TaskUpload.tsx` fetches `task_fields` from DB and uses them for dynamic Excel column mapping, type parsing, and validation based on column headers (matching `field.title`).

### C. Analytics & Performance
- **View Collections:** We DO NOT fetch all tasks for all users on the frontend.
- **`monthly_user_stats`:** A SQL View defined in `main.go` aggregates hours by user and month directly in SQLite.
- **Charts:** 
    - `DailyComparisonChart`: SVG-based, uses `viewBox` for responsiveness.
    - `ColleagueRankingChart`: Uses `monthly_user_stats` view.
    - `YearlyRankingChart`: Uses `monthly_user_stats` view (summed on frontend).

### C. UX & Layout Strategy
We use a hybrid layout approach defined in `App.css`:
1.  **Task Upload Tab (`.container-upload`):** 
    - **Single Pane of Glass.** `overflow: hidden`.
    - No page scrolling. Content must fit.
    - Left card combines "Upload Form" and "Rules" into one visual block.
2.  **Analytics/List Tab (`.container-wide`):**
    - **Standard Feed.** `overflow-y: auto`.
    - Page scrolls vertically to accommodate multiple charts.

### D. Component Specifics
- **Date Badges:** Unified via `.date-badge` CSS class (28px height).
- **Ranking Charts:** Have internal scrolling (`max-height: 400px`) to handle large numbers of users without breaking the page layout.

## 3. How to Run
1.  **Backend:** `go run . serve` (Starts PocketBase on port 8090).
2.  **Frontend:** `wails dev` (Starts UI).

## 4. Troubleshooting
- If "Missing collection context" error -> Restart Backend to recreate Views.
- If Layout breaks -> Check `App.css` for `overflow` properties on `.container-*` classes.
