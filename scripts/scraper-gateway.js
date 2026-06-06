const fs = require('fs');
const path = require('path');
const https = require('https');
const localScraper = require('./local-scraper-service');

// Load environment variables for standalone script runner
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length > 1) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        if (!process.env[key]) process.env[key] = value;
      }
    });
  }
}

loadEnv();

const PROVIDER = process.env.SCRAPER_PROVIDER || 'firecrawl';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SCRAPER_TIMEOUT = 31000; // 31 seconds timeout

/**
 * Helper to make requests to the Firecrawl REST API
 */
function firecrawlRequest(endpoint, payload, retries = 3) {
  return new Promise((resolve, reject) => {
    if (!FIRECRAWL_API_KEY) {
      reject(new Error('FIRECRAWL_API_KEY is not defined in the environment.'));
      return;
    }

    const data = JSON.stringify(payload);
    const options = {
      hostname: 'api.firecrawl.dev',
      port: 443,
      path: `/v1/${endpoint}`,
      method: 'POST',
      timeout: SCRAPER_TIMEOUT,
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        try {
          if (res.statusCode === 429) {
            if (retries > 0) {
              console.warn(`Rate limit (429) hit. Waiting 30s before retry (retries left: ${retries})...`);
              await new Promise(r => setTimeout(r, 30000));
              try {
                const retryResult = await firecrawlRequest(endpoint, payload, retries - 1);
                resolve(retryResult);
                return;
              } catch (retryErr) {
                reject(retryErr);
                return;
              }
            }
          }

          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`Firecrawl API error (${res.statusCode}): ${json.error || body}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Firecrawl API request timed out.'));
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Mapping Gateway
 */
async function map(seriesUrl) {
  console.log(`[Scraper Gateway] Mapping series using provider: ${PROVIDER}`);
  if (PROVIDER === 'local') {
    return await localScraper.localMap(seriesUrl);
  } else {
    try {
      const result = await firecrawlRequest('map', { url: seriesUrl });
      if (!result.success || !result.links) {
        throw new Error(`Failed to map via Firecrawl: ${JSON.stringify(result)}`);
      }
      return {
        success: true,
        links: result.links
      };
    } catch (err) {
      console.error('[Scraper Gateway] Firecrawl Map error:', err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

/**
 * Scraping Gateway
 */
async function scrape(chapterUrl, timeout = 35000) {
  console.log(`[Scraper Gateway] Scraping chapter using provider: ${PROVIDER}`);
  if (PROVIDER === 'local') {
    return await localScraper.localScrape(chapterUrl, timeout);
  } else {
    try {
      const result = await firecrawlRequest('scrape', {
        url: chapterUrl,
        formats: ['markdown']
      });
      if (!result.success || !result.data) {
        throw new Error(`Failed to scrape via Firecrawl: ${JSON.stringify(result)}`);
      }
      return {
        success: true,
        data: {
          markdown: result.data.markdown || ''
        }
      };
    } catch (err) {
      console.error(`[Scraper Gateway] Firecrawl Scrape error for ${chapterUrl}:`, err.message);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = {
  map,
  scrape,
  getProvider: () => PROVIDER
};
