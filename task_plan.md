# Task Plan: Implement Database Backups in Scrapers

## Goal
Implement safe database backups (`.bak` files) immediately before writing to the database in `scripts/scrape-series.js` and `scripts/scrape-missing.js`.

## Current Phase
Phase 1: Requirements & Discovery

## Phases

### Phase 1: Requirements & Discovery
- [x] View files `scripts/scrape-series.js` and `scripts/scrape-missing.js`
- [x] Identify where the database files are written using `fs.writeFileSync`
- [x] Plan the backup logic details
- **Status:** complete

### Phase 2: Design Confirmation (Brainstorming Lock)
- [x] Brainstorm the backup strategy details
- [x] Establish "Understanding Lock" and present design to main agent / user
- [x] Get design confirmed
- **Status:** complete

### Phase 3: Implementation
- [x] Implement backups in `scripts/scrape-series.js`
- [x] Implement backups in `scripts/scrape-missing.js`
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Test `scripts/scrape-series.js` (e.g. by running in a dry-run or verification mode)
- [x] Test `scripts/scrape-missing.js`
- [x] Verify backup files exist and contain exact prior content
- **Status:** complete

### Phase 5: Handoff & Completion
- [x] Report progress and code differences to the main agent
- **Status:** complete

## Key Questions
1. Should we overwrite existing `.bak` files when performing a new backup? (Yes, the prompt says "If it does, copy it to `dbPath + '.bak'` using `fs.copyFileSync(dbPath, dbPath + '.bak')`", which naturally overwrites or creates).
2. Are there concurrency / safety concerns? (Yes, in `scrape-series.js`, there's a lock file, but `fs.copyFileSync` is fast and synchronous).

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use `fs.copyFileSync` | Specifically requested by user and is synchronous and reliable. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| None | - | - |
