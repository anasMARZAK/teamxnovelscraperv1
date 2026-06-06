'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface ChapterNavigation {
  id: string;
  title: string;
}

interface ReaderProps {
  seriesId: string;
  chapterId: string;
  chapterTitle: string;
  images: string[];
  chapters: ChapterNavigation[];
}

export default function Reader({ seriesId, chapterId, chapterTitle, images, chapters }: ReaderProps) {
  const router = useRouter();
  
  // Navigation pointers
  const currentChapterIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentChapterIndex > 0 ? chapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex < chapters.length - 1 ? chapters[currentChapterIndex + 1] : null;

  // Reading settings
  const [readingMode, setReadingMode] = useState<'scroll' | 'page'>('scroll');
  const [zoomLevel, setZoomLevel] = useState<number>(75); // percent width: 50, 75, 90, 100
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const lastScrollTop = useRef(0);

  // New features: Auto Scroll, Themes, and Brightness
  const [isAutoScrolling, setIsAutoScrolling] = useState<boolean>(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState<number>(2); // 1 to 5 speed
  const [readerTheme, setReaderTheme] = useState<'dark' | 'amoled' | 'sepia' | 'light'>('dark');
  const [brightness, setBrightness] = useState<number>(100); // 100%, 80%, 60%, 40%

  // Theme variable bindings
  const themeStyles: Record<string, React.CSSProperties> = {
    dark: {
      '--background': '#090b0e',
      '--surface': '#12161f',
      '--surface-hover': '#1b212f',
      '--text-primary': '#f1f4f9',
      '--text-secondary': '#909bb0',
      '--border': '#222a3a'
    } as React.CSSProperties,
    amoled: {
      '--background': '#000000',
      '--surface': '#0c0c0c',
      '--surface-hover': '#141414',
      '--text-primary': '#ffffff',
      '--text-secondary': '#a0a0a0',
      '--border': '#181818'
    } as React.CSSProperties,
    sepia: {
      '--background': '#f4eccf',
      '--surface': '#eae1c0',
      '--surface-hover': '#e0d6b1',
      '--text-primary': '#433422',
      '--text-secondary': '#70604c',
      '--border': '#dcd0a9'
    } as React.CSSProperties,
    light: {
      '--background': '#f8f9fa',
      '--surface': '#ffffff',
      '--surface-hover': '#e9ecef',
      '--text-primary': '#212529',
      '--text-secondary': '#495057',
      '--border': '#dee2e6'
    } as React.CSSProperties
  };

  const markAsRead = useCallback(() => {
    localStorage.setItem(`read_${seriesId}_${chapterId}`, 'true');
  }, [seriesId, chapterId]);

  const handleNextPage = useCallback(() => {
    if (currentPage < images.length - 1) {
      setCurrentPage(currentPage + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (nextChapter) {
      router.push(`/series/${seriesId}/${nextChapter.id}`);
    }
  }, [currentPage, images.length, nextChapter, router, seriesId]);

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (prevChapter) {
      router.push(`/series/${seriesId}/${prevChapter.id}`);
    }
  }, [currentPage, prevChapter, router, seriesId]);

  const handleChapterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetId = e.target.value;
    if (targetId) {
      router.push(`/series/${seriesId}/${targetId}`);
    }
  };

  const toggleReadingMode = () => {
    const nextMode = readingMode === 'scroll' ? 'page' : 'scroll';
    setReadingMode(nextMode);
    setIsAutoScrolling(false);
    setCurrentPage(0);
    window.scrollTo({ top: 0 });
  };

  // Mark as read immediately on mount if it has no images, or when reaching the end
  useEffect(() => {
    if (images.length === 0) {
      markAsRead();
    }
  }, [images.length, markAsRead]);

  // Page mode progression marks as read on the last page
  useEffect(() => {
    if (readingMode === 'page' && currentPage === images.length - 1 && images.length > 0) {
      markAsRead();
    }
  }, [currentPage, readingMode, images.length, markAsRead]);

  // Scroll mode progression marks as read on reaching bottom
  useEffect(() => {
    if (readingMode !== 'scroll') return;

    const handleScroll = () => {
      // Hide/show controls on scroll direction
      const st = window.pageYOffset || document.documentElement.scrollTop;
      if (st > lastScrollTop.current && st > 100) {
        setControlsVisible(false); // scrolling down
        setIsAutoScrolling(false); // Pause auto-scrolling on manual scroll down
      } else {
        setControlsVisible(true); // scrolling up
      }
      lastScrollTop.current = st <= 0 ? 0 : st;

      // Check bottom scroll
      const threshold = 250; // px from bottom
      const totalHeight = document.documentElement.scrollHeight;
      const visibleHeight = window.innerHeight + window.pageYOffset;
      if (totalHeight - visibleHeight < threshold) {
        markAsRead();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [readingMode, markAsRead]);

  // Auto-scroll loop
  useEffect(() => {
    if (!isAutoScrolling || readingMode !== 'scroll') return;

    let lastTime = performance.now();
    let frameId: number;

    const scrollStep = (time: number) => {
      const elapsed = time - lastTime;
      // Normalizing relative scroll steps
      const speedFactor = autoScrollSpeed * (elapsed / 16.67) * 0.75;
      window.scrollBy(0, speedFactor);
      lastTime = time;
      frameId = requestAnimationFrame(scrollStep);
    };

    frameId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(frameId);
  }, [isAutoScrolling, autoScrollSpeed, readingMode]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        // Toggle auto-scrolling on Spacebar in Webtoon mode
        if (readingMode === 'scroll') {
          e.preventDefault();
          setIsAutoScrolling(prev => !prev);
        }
      } else if (readingMode === 'page') {
        if (e.key === 'ArrowRight') {
          handleNextPage();
        } else if (e.key === 'ArrowLeft') {
          handlePrevPage();
        }
      } else {
        // Scroll mode arrow scrolling
        if (e.key === 'ArrowRight' && nextChapter) {
          router.push(`/series/${seriesId}/${nextChapter.id}`);
        } else if (e.key === 'ArrowLeft' && prevChapter) {
          router.push(`/series/${seriesId}/${prevChapter.id}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [readingMode, currentPage, prevChapter, nextChapter, handleNextPage, handlePrevPage, router, seriesId]);

  const changeZoom = (delta: number) => {
    setZoomLevel(prev => Math.max(40, Math.min(100, prev + delta)));
  };

  const cycleTheme = () => {
    const themes: ('dark' | 'amoled' | 'sepia' | 'light')[] = ['dark', 'amoled', 'sepia', 'light'];
    const currentIndex = themes.indexOf(readerTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setReaderTheme(themes[nextIndex]);
  };

  const cycleBrightness = () => {
    const levels = [100, 80, 60, 40];
    const currentIndex = levels.indexOf(brightness);
    const nextIndex = (currentIndex + 1) % levels.length;
    setBrightness(levels[nextIndex]);
  };

  const cycleAutoScrollSpeed = () => {
    setAutoScrollSpeed(prev => (prev % 5) + 1);
  };

  return (
    <div 
      className="reader-container" 
      onClick={() => setControlsVisible(prev => !prev)}
      style={{ 
        ...themeStyles[readerTheme],
        backgroundColor: 'var(--background)',
        color: 'var(--text-primary)',
        transition: 'background-color 0.3s, color 0.3s, border-color 0.3s',
        minHeight: '100vh',
        width: '100%'
      }}
    >
      {/* Floating Header */}
      <nav className="navbar glass" style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 250, 
        transform: controlsVisible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'var(--transition)',
        backgroundColor: 'var(--glass-bg)',
        borderBottomColor: 'var(--border)'
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link href={`/series/${seriesId}`} className="reader-btn" title="Back to Series" style={{ color: 'var(--text-primary)', borderColor: 'var(--border)' }}>
            ←
          </Link>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{chapterTitle}</span>
        </div>
        
        <div className="controls-group">
          <select 
            value={chapterId} 
            onChange={handleChapterChange} 
            className="controls-select"
            style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)', borderColor: 'var(--border)' }}
          >
            {chapters.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </nav>

      {/* Main Manga Reader Body */}
      <div 
        style={{ 
          width: '100%', 
          maxWidth: readingMode === 'scroll' ? `${zoomLevel}%` : '800px', 
          marginTop: '6rem', 
          transition: 'max-width 0.2s ease-in-out',
          filter: `brightness(${brightness}%)`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {images.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '8rem 2rem', 
            backgroundColor: 'var(--surface)', 
            borderRadius: '12px',
            border: '1px solid var(--border)'
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '1rem' }}>No pages found for this chapter.</p>
            <Link href={`/series/${seriesId}`} className="btn btn-secondary" style={{ display: 'inline-flex' }}>
              Back to Chapters
            </Link>
          </div>
        ) : readingMode === 'scroll' ? (
          /* Webtoon Scroll View */
          <div className="scroll-view">
            {images.map((imgUrl, idx) => (
              <Image 
                key={idx}
                src={`/api/proxy?url=${encodeURIComponent(imgUrl)}`}
                alt={`Page ${idx + 1}`}
                priority={idx < 3}
                unoptimized={true}
                width={0}
                height={0}
                sizes="100vw"
                style={{ width: '100%', height: 'auto' }}
              />
            ))}
          </div>
        ) : (
          /* Single Page Slide View */
          <div className="page-view">
            <div className="page-wrapper">
              <button 
                className="nav-side-btn nav-left" 
                onClick={(e) => { e.stopPropagation(); handlePrevPage(); }}
                disabled={currentPage === 0 && !prevChapter}
              >
                ‹
              </button>
              
              <Image 
                src={`/api/proxy?url=${encodeURIComponent(images[currentPage])}`} 
                alt={`Page ${currentPage + 1}`}
                onClick={handleNextPage}
                priority={true}
                unoptimized={true}
                width={0}
                height={0}
                sizes="100vw"
                style={{ width: '100%', height: 'auto', cursor: 'pointer' }}
              />
              
              <button 
                className="nav-side-btn nav-right" 
                onClick={(e) => { e.stopPropagation(); handleNextPage(); }}
                disabled={currentPage === images.length - 1 && !nextChapter}
              >
                ›
              </button>
            </div>
            
            <div style={{ marginTop: '1.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Page {currentPage + 1} of {images.length}
            </div>
          </div>
        )}
      </div>

      {/* Floating Reader Footer Controls */}
      <footer 
        className={`reader-controls glass ${controlsVisible ? '' : 'hidden'}`} 
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: 'var(--glass-bg)', borderColor: 'var(--border)' }}
      >
        {/* Left: Navigation Group */}
        <div className="controls-group">
          <Link 
            href={prevChapter ? `/series/${seriesId}/${prevChapter.id}` : '#'}
            className="reader-btn"
            style={{ 
              pointerEvents: prevChapter ? 'auto' : 'none', 
              opacity: prevChapter ? 1 : 0.3,
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
            title="Previous Chapter"
          >
            «
          </Link>
          {readingMode === 'page' && (
            <>
              <button onClick={handlePrevPage} disabled={currentPage === 0 && !prevChapter} className="reader-btn" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                ‹
              </button>
              <button onClick={handleNextPage} disabled={currentPage === images.length - 1 && !nextChapter} className="reader-btn" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                ›
              </button>
            </>
          )}
          <Link 
            href={nextChapter ? `/series/${seriesId}/${nextChapter.id}` : '#'}
            className="reader-btn"
            style={{ 
              pointerEvents: nextChapter ? 'auto' : 'none', 
              opacity: nextChapter ? 1 : 0.3,
              borderColor: 'var(--border)',
              color: 'var(--text-primary)'
            }}
            title="Next Chapter"
          >
            »
          </Link>
        </div>

        {/* Center: Scroll AutoScroll HUD Controls */}
        <div className="controls-group" style={{ gap: '0.4rem' }}>
          {readingMode === 'scroll' ? (
            <>
              <button 
                onClick={() => setIsAutoScrolling(!isAutoScrolling)} 
                className={`reader-btn ${isAutoScrolling ? 'active' : ''}`}
                style={{ width: 'auto', padding: '0 0.75rem', fontSize: '0.85rem', fontWeight: 600, borderColor: 'var(--border)' }}
                title="Spacebar to toggle auto scroll"
              >
                {isAutoScrolling ? '⏸ Pause' : '▶ Auto Scroll'}
              </button>
              {isAutoScrolling && (
                <button 
                  onClick={cycleAutoScrollSpeed} 
                  className="reader-btn"
                  style={{ width: 'auto', padding: '0 0.5rem', fontSize: '0.8rem', fontWeight: 700, borderColor: 'var(--border)', color: 'var(--primary)' }}
                  title="Cycle auto scroll speed"
                >
                  Speed: {autoScrollSpeed}x
                </button>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 600 }}>
              Page {currentPage + 1}/{images.length}
            </div>
          )}
        </div>

        {/* Right: Settings Group */}
        <div className="controls-group">
          {/* Zoom controls (only in scroll mode) */}
          {readingMode === 'scroll' && (
            <>
              <button onClick={() => changeZoom(-10)} className="reader-btn" title="Zoom Out" disabled={zoomLevel <= 40} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                -
              </button>
              <span style={{ fontSize: '0.85rem', width: '32px', textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>{zoomLevel}%</span>
              <button onClick={() => changeZoom(10)} className="reader-btn" title="Zoom In" disabled={zoomLevel >= 100} style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                +
              </button>
            </>
          )}

          {/* Theme Cycler */}
          <button 
            onClick={cycleTheme} 
            className="reader-btn" 
            title={`Cycle theme: Current ${readerTheme}`}
            style={{ fontSize: '1rem', borderColor: 'var(--border)' }}
          >
            {readerTheme === 'dark' && '🌙'}
            {readerTheme === 'amoled' && '🌑'}
            {readerTheme === 'sepia' && '📜'}
            {readerTheme === 'light' && '☀️'}
          </button>

          {/* Brightness Dimmer */}
          <button 
            onClick={cycleBrightness} 
            className="reader-btn"
            title={`Brightness: ${brightness}%`}
            style={{ fontSize: '1rem', borderColor: 'var(--border)', color: brightness < 100 ? 'var(--primary)' : 'var(--text-primary)' }}
          >
            🔆
          </button>
          
          {/* Mode Switcher */}
          <button 
            onClick={toggleReadingMode} 
            className="btn btn-secondary"
            style={{ padding: '0.5rem 0.85rem', fontSize: '0.85rem', backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            {readingMode === 'scroll' ? 'Page View' : 'Webtoon View'}
          </button>
        </div>
      </footer>
    </div>
  );
}
