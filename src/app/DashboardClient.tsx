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
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px', color: 'var(--primary)' }}>
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                Scraper Console
              </h3>
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
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '14px', height: '14px' }}>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
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
                {jobStatus?.status === 'running' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '14px', height: '14px', color: 'var(--primary)' }}>
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                    </svg>
                    Running
                  </span>
                )}
                {jobStatus?.status === 'completed' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: 'var(--success)' }}>
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    Completed
                  </span>
                )}
                {jobStatus?.status === 'failed' && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px', color: '#ef4444' }}>
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Failed
                  </span>
                )}
                {(!jobStatus || jobStatus?.status === 'idle') && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '14px', height: '14px', color: '#f59e0b', animation: 'spin 1.5s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="30 10"></circle>
                    </svg>
                    Initializing...
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
      <nav className="navbar glass">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '22px', height: '22px', stroke: 'url(#logo-grad)' }}>
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="100%" stopColor="var(--accent)" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="3" fill="url(#logo-grad)"></circle>
            <path d="M3 12a9 9 0 0 1 15-6.7M21 12a9 9 0 0 1-15 6.7"></path>
            <ellipse cx="12" cy="12" rx="9" ry="3" transform="rotate(-30 12 12)"></ellipse>
          </svg>
          <span>Neo Manga Reader</span>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Powered by Firecrawl MCP
        </div>
      </nav>

      <div className="container">
        {/* Hero Section */}
        <header className="hero">
          <div className="hero-container">
            <div className="hero-content">
              <h1>Your Personal Manga Workspace</h1>
              <p>
                An ad-free, high-performance manga and manhwa reader. Input a series landing page from supported scanlation sites to index chapters instantly.
              </p>
            </div>
            <div className="hero-artwork">
              <svg width="200" height="200" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Abstract grid network */}
                <rect x="15" y="15" width="170" height="170" rx="12" stroke="rgba(255, 74, 125, 0.12)" strokeWidth="1.5" />
                <rect x="35" y="35" width="130" height="130" rx="8" stroke="rgba(122, 34, 255, 0.15)" strokeWidth="1.5" />
                <circle cx="100" cy="100" r="50" stroke="rgba(255, 74, 125, 0.15)" strokeWidth="1" strokeDasharray="3 3" />
                
                {/* Diagonal lines */}
                <line x1="15" y1="15" x2="185" y2="185" stroke="url(#hero-art-grad)" strokeWidth="1" strokeDasharray="5 5" />
                <line x1="185" y1="15" x2="15" y2="185" stroke="url(#hero-art-grad)" strokeWidth="1" strokeDasharray="5 5" />
                
                {/* Inner decorative shapes */}
                <rect x="75" y="75" width="50" height="50" rx="6" fill="rgba(18, 22, 31, 0.65)" stroke="url(#hero-art-grad)" strokeWidth="2" />
                <circle cx="100" cy="100" r="12" fill="none" stroke="url(#hero-art-grad)" strokeWidth="1.5" />
                <circle cx="100" cy="100" r="5" fill="var(--primary)" />
                
                {/* Visual anchor point crosses */}
                <path d="M15 100h10M175 100h10M100 15v10M100 175v10" stroke="rgba(122, 34, 255, 0.4)" strokeWidth="1.5" />
                
                <defs>
                  <linearGradient id="hero-art-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--primary)" />
                    <stop offset="100%" stopColor="var(--accent)" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
          </div>
        </header>

        {/* Scraper Control Center */}
        <section className="import-card">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '18px', height: '18px', color: 'var(--primary)' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Import Series
          </h3>
          <form className="scrape-box" onSubmit={handleScrapeSubmit} style={{ display: 'block' }}>
            <div className="scrape-form-row">
              <div className="input-icon-container">
                <input
                  type="url"
                  placeholder="Paste series URL (e.g., https://olympustaff.com/series/tcf/)"
                  value={scrapeUrl}
                  onChange={(e) => setScrapeUrl(e.target.value)}
                  disabled={isScraping}
                  required
                />
                <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </div>
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
            
            {/* Custom Styled Switch for Overwrite */}
            <label className="custom-checkbox-container">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={isScraping}
              />
              <div className="custom-checkbox"></div>
              <span className="custom-checkbox-label">
                Force Overwrite / Refresh Existing Chapters
              </span>
            </label>
          </form>
        </section>

        {/* Manga Library Listing */}
        <main>
          <div className="library-header-row">
            <h2 style={{ fontWeight: 700, fontSize: '1.5rem' }}>Your Library</h2>
            <div className="search-box input-icon-container">
              <input
                type="text"
                placeholder="Search library..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
          </div>
          
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
