const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const TurndownService = require('turndown');

puppeteer.use(StealthPlugin());

// Initialize Turndown service for HTML -> Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bullet: '*'
});

// Configure Turndown to preserve images exactly
turndownService.addRule('images', {
  filter: 'img',
  replacement: (content, node) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return src ? `![${alt}](${src})` : '';
  }
});

/**
 * Launch headless browser with stealth configurations
 */
async function getBrowserInstance() {
  return await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
}

/**
 * Maps the target series page to find all chapter links
 */
async function localMap(seriesUrl) {
  console.log(`[Local Scraper] Mapping links for series: ${seriesUrl}`);
  let browser;
  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();
    
    // Set custom user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block unnecessary resources to speed up mapping
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    const cleanSeriesUrl = seriesUrl.replace(/\/$/, '');
    const allLinks = new Set();
    const pagesToVisit = [cleanSeriesUrl];
    const visitedPages = new Set();
    const maxPages = 1; // Only need the first page since chapters are sequential and we generate them directly
    
    let index = 0;
    while (index < pagesToVisit.length && visitedPages.size < maxPages) {
      const currentUrl = pagesToVisit[index];
      index++;
      
      // Normalize currentUrl
      let normalizedUrl;
      try {
        const u = new URL(currentUrl);
        u.hash = '';
        const pageNum = u.searchParams.get('page');
        u.search = '';
        if (pageNum) {
          u.searchParams.set('page', pageNum);
        }
        normalizedUrl = u.toString();
      } catch (e) {
        normalizedUrl = currentUrl;
      }
      
      if (visitedPages.has(normalizedUrl)) continue;
      visitedPages.add(normalizedUrl);
      
      console.log(`[Local Scraper] Mapping page: ${normalizedUrl}`);
      await page.goto(normalizedUrl, { waitUntil: 'networkidle2', timeout: 35000 });
      
      // Scroll to the bottom of the page slowly to trigger lazy loading of chapters
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });
      
      // Short wait for any late-rendered links
      await new Promise(r => setTimeout(r, 1500));
      
      // Extract all anchor links
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => a.href);
      });
      
      links.forEach(link => {
        allLinks.add(link);
        
        // Check if it's a paginated page of the same series
        if (link.startsWith(cleanSeriesUrl + '?page=')) {
          try {
            const u = new URL(link);
            u.hash = '';
            const pageNum = u.searchParams.get('page');
            u.search = '';
            if (pageNum) {
              u.searchParams.set('page', pageNum);
            }
            const normalizedLink = u.toString();
            if (!pagesToVisit.includes(normalizedLink) && !visitedPages.has(normalizedLink)) {
              pagesToVisit.push(normalizedLink);
            }
          } catch(e) {}
        }
      });
    }

    await browser.close();
    return {
      success: true,
      links: Array.from(allLinks)
    };
  } catch (error) {
    console.error(`[Local Scraper] Map error:`, error.message);
    if (browser) await browser.close();
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Scrapes a single chapter URL, returns the markdown structure
 */
async function localScrape(chapterUrl, timeout = 35000) {
  console.log(`[Local Scraper] Scraping chapter: ${chapterUrl} (timeout: ${timeout}ms)`);
  
  // Introduce human-like randomized delay (jitter) to prevent IP bans
  const jitter = 1000 + Math.random() * 2000;
  await new Promise(r => setTimeout(r, jitter));
  
  let browser;
  try {
    browser = await getBrowserInstance();
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block stylesheets and fonts to save memory
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Go to chapter and wait for network idle to ensure image tags are loaded/hydrated
    await page.goto(chapterUrl, { waitUntil: 'networkidle2', timeout: timeout });
    
    // Scroll to the bottom of the page slowly to trigger lazy loading of panels
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });

    // Short wait for any late-rendered image assets
    await new Promise(r => setTimeout(r, 1500));
    
    // Retrieve the page HTML content
    const htmlContent = await page.content();
    
    // Convert to markdown using Turndown
    const markdown = turndownService.turndown(htmlContent);

    await browser.close();
    return {
      success: true,
      data: {
        markdown: markdown
      }
    };
  } catch (error) {
    console.error(`[Local Scraper] Scrape error for ${chapterUrl}:`, error.message);
    if (browser) await browser.close();
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  localMap,
  localScrape
};
