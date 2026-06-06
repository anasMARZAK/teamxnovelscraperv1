const fs = require('fs');
const path = require('path');
const scraperGateway = require('./scraper-gateway');

const dbPath = path.join(__dirname, '..', 'data', 'mangas.json');
const lockPath = path.join(__dirname, '..', 'data', 'mangas.json.lock');
const jobsDir = path.join(__dirname, '..', 'data', 'jobs');

// Job status tracking
let jobState = null;
let seriesIdForJob = null;

function initJobStatus(seriesId, provider) {
  seriesIdForJob = seriesId;
  if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true });
  jobState = {
    seriesId,
    status: 'running',
    provider: provider || process.env.SCRAPER_PROVIDER || 'local',
    totalChapters: 0,
    scrapedChapters: 0,
    percent: 0,
    currentPass: 1,
    maxPasses: 3,
    startedAt: new Date().toISOString(),
    logs: []
  };
  writeJobStatus();
}

function writeJobStatus() {
  if (!jobState || !seriesIdForJob) return;
  try {
    const jobPath = path.join(jobsDir, `${seriesIdForJob}.json`);
    fs.writeFileSync(jobPath, JSON.stringify(jobState, null, 2), 'utf-8');
  } catch (e) { /* silent */ }
}

function addLog(level, message) {
  if (!jobState) return;
  jobState.logs.push({ ts: new Date().toISOString(), level, message });
  // Keep only last 500 log lines to prevent bloat
  if (jobState.logs.length > 500) jobState.logs = jobState.logs.slice(-500);
  writeJobStatus();
}

function updateJobStats(updates) {
  if (!jobState) return;
  Object.assign(jobState, updates);
  if (jobState.totalChapters > 0) {
    jobState.percent = Math.round((jobState.scrapedChapters / jobState.totalChapters) * 100);
  }
  writeJobStatus();
}

// Intercept console methods to capture logs
const origLog = console.log;
const origWarn = console.warn;
const origError = console.error;

console.log = (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  addLog('INFO', msg);
  origLog.apply(console, args);
};
console.warn = (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  addLog('WARN', msg);
  origWarn.apply(console, args);
};
console.error = (...args) => {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  addLog('ERROR', msg);
  origError.apply(console, args);
};

// Helper to filter out non-chapter image URLs (logos, ads, icons, etc.)
function cleanImageUrls(urls) {
  const filterKeywords = [
    'logo', 'avatar', 'icon', 'facebook', 'twitter', 'discord', 'banner', 'flag', 
    'loader', 'sidebar', 'adsense', 'googleads', 'widget', 'comment', 'gravatar', 'theme', 'wp-content/themes',
    'wp-content/plugins', 'analytics', 'pixel', 'pinterest', 'instagram', 'youtube',
    'profile', 'bg-', 'background', 'emoticon', 'emoji', 'button', 'loading'
  ];

  return urls.filter(url => {
    const lowerUrl = url.toLowerCase();
    
    // Must be an image extension or look like a dynamic image path
    const hasImageExt = /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(lowerUrl);
    const hasNoExtButIsCdn = lowerUrl.includes('wp-content/uploads') || lowerUrl.includes('/uploads/') || lowerUrl.includes('cdn');
    
    if (!hasImageExt && !hasNoExtButIsCdn) return false;
    
    // Exclude general UI/Ad keywords
    const isUiIcon = filterKeywords.some(keyword => lowerUrl.includes(keyword)) || lowerUrl.includes('/ad/') || lowerUrl.includes('_ad_') || lowerUrl.includes('-ad-');
    return !isUiIcon;
  });
}

// Core map function to get all pages of the series
async function getChapterLinks(seriesUrl) {
  console.log(`Mapping website links for series: ${seriesUrl}...`);
  try {
    const result = await scraperGateway.map(seriesUrl);
    if (!result.success || !result.links) {
      throw new Error(`Failed to map: ${result.error || JSON.stringify(result)}`);
    }

    console.log(`Found ${result.links.length} total links on page(s). Filtering for chapters...`);
    
    // Filter out chapter links
    // On olympustaff.com, chapter links are base URL followed by numbers, e.g.: https://olympustaff.com/series/release-that-witch/300
    const cleanSeriesUrl = seriesUrl.replace(/\/$/, '');
    const escapedPath = cleanSeriesUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const chRegex = new RegExp("^" + escapedPath + "\\/\\d+\\/?$");
    const chapterLinks = result.links.filter(link => chRegex.test(link));

    // Remove duplicates
    const uniqueLinks = [...new Set(chapterLinks)];
    
    if (uniqueLinks.length > 0) {
      // Parse chapter numbers to find the latest chapter
      const numbers = uniqueLinks.map(link => {
        const match = link.match(/\/(\d+)\/?$/);
        return match ? parseInt(match[1], 10) : 0;
      });
      const maxNum = Math.max(...numbers);
      if (maxNum > 0) {
        const generatedLinks = [];
        for (let i = 0; i <= maxNum; i++) {
          generatedLinks.push(`${cleanSeriesUrl}/${i}`);
        }
        console.log(`Filtered down to ${uniqueLinks.length} mapped links. Generated full list of ${generatedLinks.length} sequential chapters (0 to ${maxNum}).`);
        return generatedLinks;
      }
    }

    console.log(`Filtered down to ${uniqueLinks.length} unique chapter URLs.`);
    return uniqueLinks;
  } catch (error) {
    console.error('Map error:', error.message);
    throw error;
  }
}

// Scrape a single chapter link to extract images
async function scrapeChapter(chapterUrl, timeout = 35000) {
  console.log(`Scraping chapter: ${chapterUrl}...`);
  try {
    const result = await scraperGateway.scrape(chapterUrl, timeout);

    if (!result.success || !result.data) {
      throw new Error(`Failed to scrape: ${result.error || JSON.stringify(result)}`);
    }

    const markdown = result.data.markdown || '';
    
    // Extract image URLs from markdown: ![alt](url)
    const imgRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
    let match;
    const rawImages = [];
    while ((match = imgRegex.exec(markdown)) !== null) {
      rawImages.push(match[1].trim());
    }

    const cleanedImages = cleanImageUrls(rawImages);
    console.log(`Extracted ${cleanedImages.length} manga panel images (filtered from ${rawImages.length} raw links) from ${chapterUrl}.`);
    
    return cleanedImages;
  } catch (error) {
    console.error(`Scrape error for ${chapterUrl}:`, error.message);
    return []; // Return empty list on failure rather than breaking the whole process
  }
}

// Helper to sort chapters logically (e.g. chapter-1 before chapter-10)
function sortChapters(chapters) {
  return chapters.sort((a, b) => {
    const numA = parseFloat(a.id.replace(/^[^\d]*/, '')) || 0;
    const numB = parseFloat(b.id.replace(/^[^\d]*/, '')) || 0;
    return numA - numB;
  });
}

// Simple lock-file management to prevent concurrent writes/reads collisions
async function acquireLock(maxAttempts = 10) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!fs.existsSync(lockPath)) {
      fs.writeFileSync(lockPath, process.pid.toString(), 'utf-8');
      return true;
    }

    // Check if the locking process is still alive
    try {
      const lockPidStr = fs.readFileSync(lockPath, 'utf-8').trim();
      const lockPid = parseInt(lockPidStr, 10);
      if (lockPid) {
        try {
          process.kill(lockPid, 0); // checks if process exists
        } catch (killErr) {
          // ESRCH means process does not exist
          if (killErr.code === 'ESRCH') {
            console.warn(`[Lock] Stale lock detected (PID ${lockPid} is not running). Clearing lock...`);
            try {
              fs.unlinkSync(lockPath);
            } catch (unlinkErr) { /* ignore */ }
            fs.writeFileSync(lockPath, process.pid.toString(), 'utf-8');
            return true;
          }
        }
      }
    } catch (readErr) {
      // Ignore reading errors if lock was deleted/modified by another process at the same instant
    }

    console.warn(`[Lock] Database is locked by another process (attempt ${attempt}/${maxAttempts}). Retrying in 2 seconds...`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Could not acquire database lock. Another scraper instance is running.');
}

function releaseLock() {
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch (e) {}
  }
}

// Atomic save function to write database safely
function saveDatabase(seriesId, newChaptersBatch, coverUrl) {
  let db = {};
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    } catch (e) {
      console.warn('Failed to parse mangas.json, starting fresh:', e.message);
    }
  }

  if (!db[seriesId]) {
    db[seriesId] = {
      title: seriesId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
      url: `https://olympustaff.com/series/${seriesId}`,
      coverUrl: '',
      chapters: []
    };
  }

  const existingChapters = db[seriesId].chapters || [];
  const chapterMap = new Map(existingChapters.map(ch => [ch.id, ch]));
  
  newChaptersBatch.forEach(newCh => {
    if (newCh.images && newCh.images.length > 0) {
      chapterMap.set(newCh.id, newCh);
    }
  });

  db[seriesId].chapters = sortChapters(Array.from(chapterMap.values()));
  
  if (coverUrl && !db[seriesId].coverUrl) {
    db[seriesId].coverUrl = coverUrl;
  } else if (!db[seriesId].coverUrl && db[seriesId].chapters.length > 0 && db[seriesId].chapters[0].images.length > 0) {
    db[seriesId].coverUrl = db[seriesId].chapters[0].images[0];
  }

  // Atomic file write using temporary file rename
  const tempPath = `${dbPath}.tmp`;
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, dbPath + '.bak');
  }
  fs.writeFileSync(tempPath, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempPath, dbPath);
  
  return db[seriesId].chapters.length;
}

// Main runner function
async function run() {
  const targetSeriesUrl = process.argv[2] || 'https://olympustaff.com/series/release-that-witch/';
  const limit = process.argv[3] ? parseInt(process.argv[3]) : null;

  const seriesIdMatch = targetSeriesUrl.match(/\/series\/([^\/]+)/);
  const seriesId = seriesIdMatch ? seriesIdMatch[1] : 'unknown-series';

  initJobStatus(seriesId, process.env.SCRAPER_PROVIDER);

  console.log('----------------------------------------------------');
  console.log(`Starting Dynamic Scraper for: ${targetSeriesUrl}`);
  if (limit) console.log(`Limit active: Scraping only ${limit} chapters.`);
  console.log('----------------------------------------------------');

  try {
    await acquireLock();
    
    const chapterUrls = await getChapterLinks(targetSeriesUrl);
    if (chapterUrls.length === 0) {
      console.log('No chapters found! Exiting.');
      updateJobStats({ status: 'completed', percent: 100 });
      releaseLock();
      return;
    }

    // Parse existing database to find already scraped chapters
    let db = {};
    if (fs.existsSync(dbPath)) {
      try {
        db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      } catch (e) {}
    }

    const overwrite = process.env.SCRAPER_OVERWRITE === 'true';
    const existingChaptersList = db[seriesId] ? (db[seriesId].chapters || []) : [];
    const scrapedUrls = new Set(existingChaptersList.filter(ch => ch.images && ch.images.length > 0).map(ch => ch.url));
    const unscrapedUrls = overwrite ? chapterUrls : chapterUrls.filter(url => !scrapedUrls.has(url));

    if (overwrite) {
      console.log(`Overwrite flag is ACTIVE. Re-scraping all ${chapterUrls.length} chapters.`);
    } else {
      console.log(`Of the ${chapterUrls.length} discovered chapters, ${scrapedUrls.size} are already scraped and saved.`);
      console.log(`Remaining chapters to scrape: ${unscrapedUrls.length}`);
    }

    updateJobStats({ totalChapters: unscrapedUrls.length });

    if (unscrapedUrls.length === 0) {
      console.log('All chapters have already been scraped! Exiting.');
      updateJobStats({ status: 'completed', percent: 100 });
      releaseLock();
      return;
    }

    let urlsToScrape = limit ? unscrapedUrls.slice(0, limit) : unscrapedUrls;

    // Self-healing retry loops (up to 3 passes)
    let currentPass = 1;
    const maxPasses = 3;

    while (urlsToScrape.length > 0 && currentPass <= maxPasses) {
      console.log(`\n====================================================`);
      console.log(`PASS ${currentPass}/${maxPasses} - Scraping ${urlsToScrape.length} remaining chapters`);
      console.log(`====================================================\n`);

      updateJobStats({ currentPass });

      // Determine concurrency and timeout configurations per pass
      let concurrencyLimit = 4;
      let scrapeTimeout = 35000; // 35 seconds

      if (currentPass === 2) {
        concurrencyLimit = 2; // slow down to prevent concurrency congestion
        scrapeTimeout = 60000; // 60 seconds
      } else if (currentPass === 3) {
        concurrencyLimit = 1; // single-threaded pass to isolate pages
        scrapeTimeout = 90000; // 90 seconds
      }

      // If local mode is bypassed, use firecrawl defaults
      if (scraperGateway.getProvider() !== 'local') {
        concurrencyLimit = 10;
      }

      const failedUrls = [];

      for (let i = 0; i < urlsToScrape.length; i += concurrencyLimit) {
        const chunk = urlsToScrape.slice(i, i + concurrencyLimit);
        console.log(`Processing batch: ${i + 1} to ${Math.min(i + concurrencyLimit, urlsToScrape.length)}...`);

        const batchResults = await Promise.all(chunk.map(async (url) => {
          const chIdMatch = url.match(/\/chapter-([^\/]+)/) || url.match(/\/ch-([^\/]+)/) || url.match(/\/([^\/]+)\/?$/);
          const chIdRaw = chIdMatch ? chIdMatch[1] : url.substring(url.lastIndexOf('/') + 1);
          const chId = `chapter-${chIdRaw}`;
          const chTitle = `Chapter ${chIdRaw.replace('-', '.')}`;

          const images = await scrapeChapter(url, scrapeTimeout);

          if (images.length === 0) {
            failedUrls.push(url);
          }

          return {
            id: chId,
            title: chTitle,
            url: url,
            images: images
          };
        }));

        // Filter out failures from being saved/overwrite
        const validBatchResults = batchResults.filter(r => r.images && r.images.length > 0);
        
        if (validBatchResults.length > 0) {
          const totalSaved = saveDatabase(seriesId, validBatchResults, null);
          console.log(`Saved batch to database. Current total chapters: ${totalSaved}`);
          updateJobStats({ scrapedChapters: (jobState ? jobState.scrapedChapters : 0) + validBatchResults.length });
        }
        
        // Delay slightly between batches
        if (i + concurrencyLimit < urlsToScrape.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // Prepare next pass
      urlsToScrape = failedUrls;
      currentPass++;
    }

    console.log('----------------------------------------------------');
    if (urlsToScrape.length > 0) {
      console.warn(`Scraping complete, but ${urlsToScrape.length} chapters failed after ${maxPasses} passes:`, urlsToScrape);
      updateJobStats({ status: 'completed' });
    } else {
      console.log('Scraping complete! Successfully scraped 100% of manga chapters.');
      updateJobStats({ status: 'completed', percent: 100 });
    }
    console.log('----------------------------------------------------');

  } catch (error) {
    console.error('Fatal error during scraping process:', error.message);
    updateJobStats({ status: 'failed' });
  } finally {
    releaseLock();
  }
}

run();
