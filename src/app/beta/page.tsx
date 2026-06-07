import fs from 'fs';
import path from 'path';
import BetaClient from './BetaClient';

export const dynamic = 'force-dynamic';

export default function BetaPage() {
  const dbPath = path.join(process.cwd(), 'data', 'mangas.json');
  let catalog = {};

  if (fs.existsSync(dbPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e: unknown) {
      console.error('Failed to read catalog file:', e instanceof Error ? e.message : String(e));
    }
  }

  return <BetaClient initialCatalog={catalog} />;
}
