import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Register StealthPlugin globally if it hasn't been registered yet
if (!(puppeteer as any).customQueryHandlers) {
  try {
    puppeteer.use(StealthPlugin());
  } catch {
    // Ignore already registered plugin error
  }
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q');
  const provider = searchParams.get('provider') || 'local';

  if (!query) {
    return NextResponse.json({ success: false, error: 'Missing query parameter "q"' }, { status: 400 });
  }

  console.log(`[Search Scraper] Searching for "${query}" via provider "${provider}"`);
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    const page = await browser.newPage();
    
    // Set custom user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Block stylesheets and fonts to save memory and speed up load
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const type = request.resourceType();
      if (['stylesheet', 'font', 'media'].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    // Query olympustaff WordPress search
    const searchUrl = `https://olympustaff.com/?s=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Give time for dynamic scripts to load
    await new Promise(r => setTimeout(r, 2500));

    // Extract search cards using DOM selectors
    const results = await page.evaluate(() => {
      const cards: Array<{ title: string; href: string; imgUrl: string }> = [];
      const titles = document.querySelectorAll('.entry-title');
      
      titles.forEach(titleEl => {
        const titleText = titleEl.textContent?.trim() || '';
        const linkEl = titleEl.querySelector('a');
        const href = linkEl ? linkEl.href : '';
        
        // Traverse up to find the common card container enclosing the thumbnail image
        let parent = titleEl.parentElement;
        let imgUrl = '';
        
        for (let i = 0; i < 4; i++) {
          if (!parent) break;
          const img = parent.querySelector('img');
          if (img) {
            imgUrl = img.src || img.getAttribute('data-src') || img.getAttribute('srcset') || '';
            break;
          }
          parent = parent.parentElement;
        }
        
        // Ensure it is a valid series link (not an individual chapter post)
        // individual chapters have paths like /series/manga/chapter_num
        const isSeries = href.includes('/series/') && href.split('/series/')[1]?.split('/').filter(Boolean).length === 1;

        if (isSeries && titleText.length > 0) {
          cards.push({ title: titleText, href, imgUrl });
        }
      });
      return cards;
    });

    // De-duplicate the results based on detail href links
    const uniqueResultsMap = new Map();
    results.forEach(item => {
      uniqueResultsMap.set(item.href, item);
    });
    const uniqueResults = Array.from(uniqueResultsMap.values());

    await browser.close();
    
    console.log(`[Search Scraper] Found ${uniqueResults.length} unique series results.`);
    return NextResponse.json({
      success: true,
      results: uniqueResults
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Search Scraper] Error searching:', message);
    if (browser) await browser.close();
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
