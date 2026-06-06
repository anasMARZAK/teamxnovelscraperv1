import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import Reader from '@/components/Reader';

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
    chapter: string;
  }>;
}

export default async function ChapterPage({ params }: PageProps) {
  const { seriesId, chapter: chapterId } = await params;

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
        <nav className="navbar glass">
          <Link href="/" className="logo">
            <span>🌌</span> Neo Manga Reader
          </Link>
        </nav>
        <div className="container" style={{ textAlign: 'center', padding: '8rem 2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem', letterSpacing: '-0.5px' }}>Series Not Found</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
            The series &ldquo;{seriesId}&rdquo; could not be found in our database.
          </p>
          <Link href="/" className="btn btn-primary" style={{ display: 'inline-flex' }}>
            Back to Dashboard
          </Link>
        </div>
      </>
    );
  }

  const currentChapter = manga.chapters.find((c) => c.id === chapterId);

  if (!currentChapter) {
    return (
      <>
        <nav className="navbar glass">
          <Link href={`/series/${seriesId}`} className="logo">
            <span>🌌</span> Neo Manga Reader
          </Link>
        </nav>
        <div className="container" style={{ textAlign: 'center', padding: '8rem 2rem' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '1.5rem', letterSpacing: '-0.5px' }}>Chapter Not Found</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem' }}>
            The chapter &ldquo;{chapterId}&rdquo; could not be found under the series &ldquo;{manga.title}&rdquo;.
          </p>
          <Link href={`/series/${seriesId}`} className="btn btn-primary" style={{ display: 'inline-flex' }}>
            Back to Chapter List
          </Link>
        </div>
      </>
    );
  }

  // Create list of chapters with basic ID and title for navigation dropdown
  const navigationChapters = manga.chapters.map((c) => ({
    id: c.id,
    title: c.title
  }));

  return (
    <Reader
      seriesId={seriesId}
      chapterId={chapterId}
      chapterTitle={currentChapter.title}
      images={currentChapter.images}
      chapters={navigationChapters}
    />
  );
}
