# Findings & Decisions: Backup Implementation

## Requirements
- In `scripts/scrape-series.js`:
  - In `saveDatabase`, right before writing content (before `fs.writeFileSync`), check if the target `dbPath` file exists. If it does, copy it to `dbPath + '.bak'` using `fs.copyFileSync(dbPath, dbPath + '.bak')`.
- In `scripts/scrape-missing.js`:
  - Right before saving the database (before `fs.writeFileSync`), check if the target `dbPath` file exists. If it does, copy it to `dbPath + '.bak'` using `fs.copyFileSync(dbPath, dbPath + '.bak')`.
- Ensure the backup file is written safely.

## Research Findings
- In `scripts/scrape-series.js`, `saveDatabase` uses atomic writes:
  ```javascript
  const tempPath = `${dbPath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempPath, dbPath);
  ```
  Wait! The requirement says: "In `saveDatabase`, right before writing content (before `fs.writeFileSync`), check if the target `dbPath` file exists. If it does, copy it to `dbPath + '.bak'` using `fs.copyFileSync(dbPath, dbPath + '.bak')`."
  So right before `fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8')`, we will check if `dbPath` exists, and if so, copy it to `dbPath + '.bak'`.
- In `scripts/scrape-missing.js`, the save is direct:
  ```javascript
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  ```
  So right before this line, we will check if `dbPath` exists, and if so, copy it to `dbPath + '.bak'`.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Perform `fs.existsSync(dbPath)` check | Ensures we only copy if the database already exists, preventing errors. |
| Use `fs.copyFileSync(dbPath, dbPath + '.bak')` | Exactly as requested by user. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| None | - |

## Resources
- Node.js fs docs: `fs.copyFileSync`, `fs.writeFileSync`, `fs.existsSync`.
- File paths: `c:\Users\Kival\Desktop\projects\anime_crawler\scripts\scrape-series.js` and `c:\Users\Kival\Desktop\projects\anime_crawler\scripts\scrape-missing.js`.
