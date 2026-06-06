'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface LogEntry {
  ts: string;
  level: string;
  message: string;
}

interface JobStatus {
  seriesId: string;
  status: 'running' | 'completed' | 'failed' | 'idle';
  provider: string;
  totalChapters: number;
  scrapedChapters: number;
  percent: number;
  currentPass: number;
  maxPasses: number;
  logs: LogEntry[];
}

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

interface Catalog {
  [key: string]: Manga;
}

interface DashboardClientProps {
  initialCatalog: Catalog;
}

export default function DashboardClient({ initialCatalog }: DashboardClientProps) {
  const [catalog, setCatalog] = useState<Catalog>(initialCatalog);
  const [searchQuery, setSearchQuery] = useState('');
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [provider, setProvider] = useState('local');
  const [overwrite, setOverwrite] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [showHud, setShowHud] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error') => {
    setToast({ message, type });
    const delay = type === 'info' ? 3000 : 5000;
    setTimeout(() => {
      setToast(current => current?.message === message ? null : current);
    }, delay);
  }, []);

  // Auto-scroll terminal when logs change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [jobStatus?.logs]);

  // Poll scrape status when activeJobId is set
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let interval: NodeJS.Timeout | undefined = undefined;

    const poll = async () => {
      try {
        const res = await fetch(`/api/scrape/status?seriesId=${activeJobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setJobStatus(data);
          if (data.status === 'completed' || data.status === 'failed') {
            setIsScraping(false);
            if (interval) clearInterval(interval);

            if (data.status === 'completed') {
              showToast('Scraping completed! Refreshing catalog...', 'success');
              try {
                const catRes = await fetch('/api/catalog');
                if (catRes.ok) setCatalog(await catRes.json());
              } catch { /* ignore */ }
            } else {
              showToast('Scraping failed. Check the console for details.', 'error');
            }
          }
        }
      } catch { /* ignore */ }
    };
    poll();
    interval = setInterval(poll, 1500);
    return () => { cancelled = true; if (interval) clearInterval(interval); };
  }, [activeJobId, showToast]);

  const handleScrapeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scrapeUrl.trim()) return;

    setIsScraping(true);
    showToast(`Submitting scrape job via ${provider === 'local' ? 'Local Scraper' : 'Firecrawl API'}...`, 'info');

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl.trim(), limit: null, provider, overwrite })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('Scrape job successfully started in the background! Pulling chapters...', 'success');
        setScrapeUrl('');
        setActiveJobId(data.seriesId);
        setShowHud(true);
        setJobStatus(null);
      } else {
        showToast(data.error || 'Failed to start scraping.', 'error');
        setIsScraping(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Network error occurred.';
      showToast(message, 'error');
      setIsScraping(false);
    }
  };



  // Filter manga items based on search query
  const filteredManga = Object.entries(catalog).filter(([key, manga]) => {
    const titleMatch = manga.title.toLowerCase().includes(searchQuery.toLowerCase());
    const keyMatch = key.toLowerCase().includes(searchQuery.toLowerCase());
    return titleMatch || keyMatch;
  });

  return (
    <>
      {/* Toast Notification */}
      {toast && (
        <div className={`status-toast glass ${toast.type === 'success' ? 'text-success' : 'text-primary'}`}>
          {toast.type === 'info' && <div className="spinner"></div>}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Scraper HUD Overlay */}
      {showHud && (
        <div className="hud-overlay">
          <div className="hud-panel glass">
            <div className="hud-header">
              <h3>🔬 Scraper Console</h3>
              <div className="hud-stats">
                <span className="hud-stat">Provider: <strong>{jobStatus?.provider || provider}</strong></span>
                <span className="hud-stat">Pass: <strong>{jobStatus?.currentPass || 0}/{jobStatus?.maxPasses || 3}</strong></span>
                <span className="hud-stat">Chapters: <strong>{jobStatus?.scrapedChapters || 0}/{jobStatus?.totalChapters || '?'}</strong></span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {jobStatus?.status === 'running' && (
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setShowHud(false)}
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    Minimize
                  </button>
                )}
                <button 
                  className="hud-close-btn" 
                  onClick={() => {
                    setShowHud(false);
                    if (!jobStatus || jobStatus.status === 'completed' || jobStatus.status === 'failed') {
                      setActiveJobId(null);
                      setJobStatus(null);
                    }
                  }}
                  title={jobStatus?.status === 'running' ? "Minimize to background" : "Close console"}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="hud-progress-track">
              <div
                className="hud-progress-fill"
                style={{ width: `${jobStatus?.percent || 0}%` }}
              />
              <span className="hud-progress-label">{jobStatus?.percent || 0}%</span>
            </div>

            {/* Terminal Log */}
            <div className="hud-terminal" ref={terminalRef}>
              {(jobStatus?.logs || []).map((log: LogEntry, i: number) => (
                <div key={i} className={`hud-log hud-log-${log.level?.toLowerCase() || 'info'}`}>
                  <span className="hud-log-ts">{new Date(log.ts).toLocaleTimeString()}</span>
                  <span className="hud-log-level">[{log.level}]</span>
                  <span className="hud-log-msg">{log.message}</span>
                </div>
              ))}
            </div>

            {/* Status Badge */}
            <div className="hud-footer">
              <span className={`hud-status-badge hud-status-${jobStatus?.status || 'idle'}`}>
                {jobStatus?.status === 'running' && '⚡ Running'}
                {jobStatus?.status === 'completed' && '✅ Completed'}
                {jobStatus?.status === 'failed' && '❌ Failed'}
                {(!jobStatus || jobStatus?.status === 'idle') && '⏳ Initializing...'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar glass">
        <div className="logo">
          <span>🌌</span> Neo Manga Reader
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Powered by Firecrawl MCP
        </div>
      </nav>

      <div className="container">
        {/* Hero Section */}
        <header className="hero">
          <h1>Your Personal Manga Workspace</h1>
          <p>
            An ad-free, high-performance manga and manhwa reader. Input a series landing page from supported scanlation sites to index chapters instantly.
          </p>
        </header>

        {/* Controls Row */}
        <section className="controls-row">
          {/* Search Box */}
          <div className="search-box">
            <input
              type="text"
              placeholder="Search library..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Scraper Trigger */}
          <form className="scrape-box" onSubmit={handleScrapeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <input
                type="url"
                placeholder="Paste series URL (e.g., https://olympustaff.com/series/release-that-witch/)"
                value={scrapeUrl}
                onChange={(e) => setScrapeUrl(e.target.value)}
                disabled={isScraping}
                required
                style={{ flexGrow: 1 }}
              />
              <select
                className="provider-select"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                disabled={isScraping}
              >
                <option value="local">Local Scraper (Stealth)</option>
                <option value="firecrawl">Firecrawl API</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={isScraping}>
                {isScraping ? 'Indexing...' : 'Index Series'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start', paddingLeft: '0.25rem' }}>
              <input
                type="checkbox"
                id="overwrite"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={isScraping}
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="overwrite" style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none' }}>
                Force Overwrite / Refresh Existing Chapters
              </label>
            </div>
          </form>
        </section>

        {/* Manga Library Listing */}
        <main>
          <h2 style={{ marginBottom: '1.5rem', fontWeight: 700, fontSize: '1.5rem' }}>Your Library</h2>
          
          {filteredManga.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '4rem 2rem', 
              backgroundColor: 'var(--surface)', 
              borderRadius: '12px',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)'
            }}>
              <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>No series found</p>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                {searchQuery ? 'Try matching a different name.' : 'Start by pasting a URL above to index a new manhwa.'}
              </p>
            </div>
          ) : (
            <div className="manga-grid">
              {filteredManga.map(([seriesId, manga], index) => {
                const chapterCount = manga.chapters?.length || 0;
                const cover = manga.coverUrl 
                  ? `/api/proxy?url=${encodeURIComponent(manga.coverUrl)}` 
                  : '/placeholder-cover.jpg'; // fallback cover

                return (
                  <Link key={seriesId} href={`/series/${seriesId}`}>
                    <div className="manga-card">
                      <div className="card-img-container">
                        <Image 
                          className="card-img" 
                          src={cover} 
                          alt={manga.title} 
                          fill={true}
                          unoptimized={true}
                          priority={index < 4}
                          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        {chapterCount > 0 && (
                          <div className="card-badge">
                            {chapterCount} {chapterCount === 1 ? 'Chapter' : 'Chapters'}
                          </div>
                        )}
                      </div>
                      <div className="card-content">
                        <h3 className="card-title">{manga.title}</h3>
                        <p className="card-meta">
                          {chapterCount > 0 
                            ? `Latest: ${manga.chapters[manga.chapters.length - 1].title}`
                            : 'No chapters crawled yet'
                          }
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Floating Restore HUD Button */}
      {activeJobId && !showHud && (
        <button 
          className="floating-hud-trigger glass" 
          onClick={() => setShowHud(true)}
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            padding: '0.8rem 1.4rem',
            borderRadius: '50px',
            border: '1px solid var(--border)',
            background: 'rgba(30, 30, 40, 0.85)',
            boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
            fontWeight: 700,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)'
          }}
        >
          <span style={{ 
            width: '8px', 
            height: '8px', 
            backgroundColor: jobStatus?.status === 'running' ? '#10b981' : (jobStatus?.status === 'failed' ? '#ef4444' : '#3b82f6'), 
            borderRadius: '50%',
            display: 'inline-block',
            boxShadow: jobStatus?.status === 'running' ? '0 0 10px #10b981' : 'none'
          }}></span>
          <span>
            {jobStatus?.status === 'running' 
              ? `Scraping Progress (${jobStatus?.percent || 0}%)` 
              : (jobStatus?.status === 'failed' ? 'Scrape Failed (Click to View)' : 'Scrape Finished (Click to View)')}
          </span>
        </button>
      )}
    </>
  );
}
