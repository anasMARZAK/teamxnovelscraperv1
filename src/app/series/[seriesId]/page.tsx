import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import SeriesClient from './SeriesClient';

export const dynamic = 'force-dynamic';

interface Chapter {
  id: string;
  title: string;
  url: string;
  images: string[];
}

interface Manga {
  title: string;
  url: string;
  coverUrl: string;
  chapters: Chapter[];
}

interface PageProps {
  params: Promise<{
    seriesId: string;
  }>;
}

export default async function SeriesPage({ params }: PageProps) {
  const { seriesId } = await params;

  const dbPath = path.join(process.cwd(), 'data', 'mangas.json');
  let manga: Manga | null = null;

  if (fs.existsSync(dbPath)) {
    try {
      const db: Record<string, Manga> = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      manga = db[seriesId] || null;
    } catch (e: unknown) {
      console.error('Failed to read catalog file:', e instanceof Error ? e.message : String(e));
    }
  }

  if (!manga) {
    return (
      <>
        {/* Navbar */}
        <nav className="navbar glass">
          <Link href="/" className="logo">
            <span>🌌</span> Neo Manga Reader
          </Link>
        </nav>
        <div className="container" style={{ textAlign: 'center', padding: '8rem 2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem', letterSpacing: '-0.5px' }}>Series Not Found</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto 2.5rem' }}>
            We couldn&apos;t find a series with ID &ldquo;{seriesId}&rdquo;. Start by indexing this series from the home dashboard.
          </p>
          <Link href="/" className="btn btn-primary" style={{ display: 'inline-flex', alignSelf: 'center' }}>
            Back to Dashboard
          </Link>
        </div>
      </>
    );
  }

  return <SeriesClient seriesId={seriesId} manga={manga} />;
}
