import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const seriesId = req.nextUrl.searchParams.get('seriesId');

  if (!seriesId) {
    return NextResponse.json({ status: 'error', error: 'Missing seriesId parameter' }, { status: 400 });
  }

  // Check for active job file
  const jobPath = path.join(process.cwd(), 'data', 'jobs', `${seriesId}.json`);
  if (fs.existsSync(jobPath)) {
    try {
      const jobData = JSON.parse(fs.readFileSync(jobPath, 'utf-8'));
      return NextResponse.json(jobData);
    } catch {
      // File exists but corrupted — try reading db
    }
  }

  // No active job — check if it already exists in the database
  const dbPath = path.join(process.cwd(), 'data', 'mangas.json');
  if (fs.existsSync(dbPath)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      if (db[seriesId]) {
        const chapterCount = db[seriesId].chapters?.length || 0;
        return NextResponse.json({
          seriesId,
          status: 'completed',
          provider: 'unknown',
          totalChapters: chapterCount,
          scrapedChapters: chapterCount,
          percent: 100,
          currentPass: 3,
          maxPasses: 3,
          logs: []
        });
      }
    } catch {
      // DB corrupted
    }
  }

  return NextResponse.json({
    seriesId,
    status: 'idle',
    provider: 'none',
    totalChapters: 0,
    scrapedChapters: 0,
    percent: 0,
    currentPass: 0,
    maxPasses: 3,
    logs: []
  });
}
