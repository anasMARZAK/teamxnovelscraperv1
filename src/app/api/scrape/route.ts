import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url, limit, provider, overwrite } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: 'Missing url parameter' }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid URL format' }, { status: 400 });
    }

    const seriesId = url.match(/\/series\/([^\/]+)/)?.[1] || 'unknown';

    // Create initial job status file so polling picks it up immediately
    const jobsDir = path.join(process.cwd(), 'data', 'jobs');
    if (!fs.existsSync(jobsDir)) fs.mkdirSync(jobsDir, { recursive: true });
    const jobPath = path.join(jobsDir, `${seriesId}.json`);
    fs.writeFileSync(jobPath, JSON.stringify({
      seriesId,
      status: 'running',
      provider: provider || 'local',
      totalChapters: 0,
      scrapedChapters: 0,
      percent: 0,
      currentPass: 0,
      maxPasses: 3,
      startedAt: new Date().toISOString(),
      logs: [{ ts: new Date().toISOString(), level: 'INFO', message: 'Scraping job queued...' }]
    }, null, 2), 'utf-8');

    const scriptPath = path.join(process.cwd(), 'scripts', 'scrape-series.js');
    const args = [url];
    if (limit) args.push(String(limit));

    console.log(`Spawning scraper: node ${scriptPath} ${args.join(' ')}`);

    const child = spawn('node', [scriptPath, ...args], {
      detached: true,
      stdio: 'ignore',
      env: { 
        ...process.env, 
        SCRAPER_PROVIDER: provider || 'local',
        SCRAPER_OVERWRITE: overwrite ? 'true' : 'false'
      }
    });

    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Scraping job successfully started in the background.',
      seriesId
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Trigger scrape error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
