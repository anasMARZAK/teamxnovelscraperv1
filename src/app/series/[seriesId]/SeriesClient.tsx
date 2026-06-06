'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

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

interface SeriesClientProps {
  seriesId: string;
  manga: Manga;
}

export default function SeriesClient({ seriesId, manga }: SeriesClientProps) {
  const [seriesData, setSeriesData] = useState<Manga>(manga);
  const [prevManga, setPrevManga] = useState<Manga>(manga);
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set());
  const [sortDescending, setSortDescending] = useState(true);

  const [chapterQuery, setChapterQuery] = useState('');

  // Sync state if initial prop changes (Render-phase state update)
  if (manga !== prevManga) {
    setPrevManga(manga);
    setSeriesData(manga);
  }

  // Load read status & setup polling for background crawler updates
  useEffect(() => {
    const readSet = new Set<string>();
    manga.chapters.forEach(chapter => {
      const isRead = localStorage.getItem(`read_${seriesId}_${chapter.id}`);
      if (isRead === 'true') {
        readSet.add(chapter.id);
      }
    });
    setTimeout(() => {
      setReadChapters(readSet);
    }, 0);

    // Poll catalog every 5 seconds to load newly scraped chapters live
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/catalog');
        if (res.ok) {
          const db = await res.json();
          if (db[seriesId]) {
            setSeriesData(db[seriesId]);
          }
        }
      } catch (e) {
        console.error('Failed to poll catalog updates', e);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [seriesId, manga]);

  const toggleReadStatus = (chapterId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const key = `read_${seriesId}_${chapterId}`;
    const newReadChapters = new Set(readChapters);

    if (readChapters.has(chapterId)) {
      localStorage.removeItem(key);
      newReadChapters.delete(chapterId);
    } else {
      localStorage.setItem(key, 'true');
      newReadChapters.add(chapterId);
    }

    setReadChapters(newReadChapters);
  };

  const sortedChapters = [...seriesData.chapters].sort((a, b) => {
    const numA = parseFloat(a.id.replace(/^[^\d]*/, '')) || 0;
    const numB = parseFloat(b.id.replace(/^[^\d]*/, '')) || 0;
    return sortDescending ? numB - numA : numA - numB;
  });

  const filteredChapters = sortedChapters.filter(chapter => 
    chapter.title.toLowerCase().includes(chapterQuery.toLowerCase()) || 
    chapter.id.toLowerCase().includes(chapterQuery.toLowerCase())
  );

  const cover = seriesData.coverUrl 
    ? `/api/proxy?url=${encodeURIComponent(seriesData.coverUrl)}` 
    : '/placeholder-cover.jpg';

  const readCount = readChapters.size;
  const totalCount = seriesData.chapters.length;
  const progressPercent = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  return (
    <>
      {/* Navbar */}
      <nav className="navbar glass">
        <Link href="/" className="logo">
          <span>🌌</span> Neo Manga Reader
        </Link>
        <Link href="/" className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
          Back to Dashboard
        </Link>
      </nav>

      <div className="container">
        {/* Series Banner */}
        <section className="series-banner">
          <div className="series-cover">
            <Image 
              src={cover} 
              alt={seriesData.title} 
              unoptimized={true} 
              width={200} 
              height={300} 
              priority={true} 
            />
          </div>
          <div className="series-meta">
            <h1>{seriesData.title}</h1>
            <p>
              Original Source: <a href={seriesData.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{seriesData.url}</a>
            </p>
            <p style={{ color: 'var(--text-secondary)' }}>
              Explore and read all indexed chapters of {seriesData.title}. All pages are proxied and compiled to load instantly with no advertisements.
            </p>
            
            <div className="series-stat-row">
              <div className="stat-item">
                <span className="stat-label">Total Chapters</span>
                <span className="stat-value">{totalCount}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Progress</span>
                <span className="stat-value">{readCount} / {totalCount} ({progressPercent}%)</span>
              </div>
            </div>
          </div>
        </section>

        {/* Chapters Section */}
        <main>
          <div className="chapters-header" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Indexed Chapters</h2>
            
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexGrow: 1, justifyContent: 'flex-end' }}>
              <div className="search-box" style={{ maxWidth: '280px', flexGrow: 1 }}>
                <input 
                  type="text" 
                  placeholder="Filter chapter number..."
                  value={chapterQuery}
                  onChange={(e) => setChapterQuery(e.target.value)}
                  style={{ padding: '0.5rem 0.9rem', fontSize: '0.9rem' }}
                />
              </div>
              
              <button 
                className="btn btn-secondary" 
                onClick={() => setSortDescending(!sortDescending)}
                style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              >
                Order: {sortDescending ? 'Newest First' : 'Oldest First'}
              </button>
            </div>
          </div>

          {seriesData.chapters.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem', 
              backgroundColor: 'var(--surface)', 
              borderRadius: '10px',
              border: '1px solid var(--border)' 
            }}>
              <p style={{ color: 'var(--text-secondary)' }}>No chapters have been indexed for this series yet.</p>
            </div>
          ) : filteredChapters.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem', 
              backgroundColor: 'var(--surface)', 
              borderRadius: '10px',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)' 
            }}>
              <p>No chapters match your filter query.</p>
            </div>
          ) : (
            <div className="chapters-list">
              {filteredChapters.map((chapter) => {
                const isRead = readChapters.has(chapter.id);
                return (
                  <Link key={chapter.id} href={`/series/${seriesId}/${chapter.id}`}>
                    <div className="chapter-card">
                      <div className="chapter-info">
                        <h3>{chapter.title}</h3>
                        <p>{chapter.images.length} pages</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {isRead && <span className="read-badge">✓ Read</span>}
                        <button 
                          onClick={(e) => toggleReadStatus(chapter.id, e)}
                          className="reader-btn"
                          title={isRead ? "Mark as unread" : "Mark as read"}
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            backgroundColor: isRead ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                            borderColor: isRead ? 'var(--success)' : 'var(--border)',
                            color: isRead ? 'var(--success)' : 'var(--text-muted)'
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
