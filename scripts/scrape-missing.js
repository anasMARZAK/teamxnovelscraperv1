const fs = require('fs');
const path = require('path');
const scraperGateway = require('./scraper-gateway');

function cleanImageUrls(urls) {
  const filterKeywords = [
    'logo', 'avatar', 'icon', 'facebook', 'twitter', 'discord', 'banner', 'flag', 
    'loader', 'sidebar', 'adsense', 'googleads', 'widget', 'comment', 'gravatar', 'theme', 'wp-content/themes',
    'wp-content/plugins', 'analytics', 'pixel', 'pinterest', 'instagram', 'youtube',
    'profile', 'bg-', 'background', 'emoticon', 'emoji', 'button', 'loading'
  ];

  return urls.filter(url => {
    const lowerUrl = url.toLowerCase();
    const hasImageExt = /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(lowerUrl);
    const hasNoExtButIsCdn = lowerUrl.includes('wp-content/uploads') || lowerUrl.includes('/uploads/') || lowerUrl.includes('cdn');
    
    if (!hasImageExt && !hasNoExtButIsCdn) return false;
    
    const isUiIcon = filterKeywords.some(keyword => lowerUrl.includes(keyword)) || lowerUrl.includes('/ad/') || lowerUrl.includes('_ad_') || lowerUrl.includes('-ad-');
    return !isUiIcon;
  });
}

async function scrapeChapter(chapterUrl) {
  console.log(`Scraping missing chapter: ${chapterUrl}...`);
  try {
    const result = await scraperGateway.scrape(chapterUrl);

    if (!result.success || !result.data) {
      throw new Error(`Failed to scrape: ${result.error || JSON.stringify(result)}`);
    }

    const markdown = result.data.markdown || '';
    const imgRegex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
    let match;
    const rawImages = [];
    while ((match = imgRegex.exec(markdown)) !== null) {
      rawImages.push(match[1].trim());
    }

    const cleanedImages = cleanImageUrls(rawImages);
    console.log(`Extracted ${cleanedImages.length} images from ${chapterUrl}.`);
    return cleanedImages;
  } catch (error) {
    console.error(`Failed to scrape ${chapterUrl}:`, error.message);
    return [];
  }
}

function sortChapters(chapters) {
  return chapters.sort((a, b) => {
    const numA = parseFloat(a.id.replace(/^[^\d]*/, '')) || 0;
    const numB = parseFloat(b.id.replace(/^[^\d]*/, '')) || 0;
    return numA - numB;
  });
}

async function run() {
  const missingChs = [43, 229, 237, 238, 239, 240, 242];
  const seriesId = 'release-that-witch';
  const dbPath = path.join(__dirname, '..', 'data', 'mangas.json');
  
  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found at ${dbPath}`);
    return;
  }
  
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  if (!db[seriesId]) {
    console.error(`Series ${seriesId} not found in database.`);
    return;
  }

  const existingChapters = db[seriesId].chapters || [];
  const chapterMap = new Map(existingChapters.map(ch => [ch.id, ch]));

  console.log(`Scraping ${missingChs.length} specific missing chapters:`, missingChs);

  for (const num of missingChs) {
    const url = `https://olympustaff.com/series/release-that-witch/${num}`;
    const images = await scrapeChapter(url);
    
    if (images && images.length > 0) {
      const chId = `chapter-${num}`;
      const chTitle = `Chapter ${num}`;
      
      chapterMap.set(chId, {
        id: chId,
        title: chTitle,
        url: url,
        images: images
      });
      console.log(`Successfully indexed Chapter ${num}.`);
    } else {
      console.log(`Skipped Chapter ${num} (no images found or page 404).`);
    }
    
    // Polite delay
    await new Promise(r => setTimeout(r, 1000));
  }

  db[seriesId].chapters = sortChapters(Array.from(chapterMap.values()));
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, dbPath + '.bak');
  }
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  console.log(`Scraping complete. Total chapters now in DB: ${db[seriesId].chapters.length}`);
}

run();
