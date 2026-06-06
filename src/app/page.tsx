import fs from 'fs';
import path from 'path';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default function Home() {
  const dbPath = path.join(process.cwd(), 'data', 'mangas.json');
  let catalog = {};

  if (fs.existsSync(dbPath)) {
    try {
      catalog = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e: unknown) {
      console.error('Failed to read catalog file:', e instanceof Error ? e.message : String(e));
    }
  }

  return <DashboardClient initialCatalog={catalog} />;
}
