# Fix ESLint Warnings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all ESLint warnings in DashboardClient, SeriesClient, and Reader components by adding useCallback memoization, correcting useEffect dependency arrays, and replacing standard img elements with next/image Image components.

**Architecture:** Use React's useCallback hook to prevent function redeclarations on each render. Update useEffect dependency lists to include missing variables (like `markAsRead`, `images.length`). Replace img elements with optimized next/image components using unoptimized, responsive width/height layout strategies.

**Tech Stack:** React 19, Next.js 16 (App Router), TypeScript, ESLint.

---

### Task 1: Fix Reader.tsx Hook Warnings and Replace Image Tags

**Files:**
- Modify: `src/components/Reader.tsx`

**Step 1: Wrap callbacks and fix dependencies**
- Modify `markAsRead` to be wrapped in `useCallback`.
- Modify `handleNextPage` to be wrapped in `useCallback`.
- Modify `handlePrevPage` to be wrapped in `useCallback`.
- Modify useEffect dependencies for all effects in the file to include missing dependencies:
  - First useEffect (line 115): `[images.length, markAsRead]`
  - Second useEffect (line 122): `[currentPage, images.length, markAsRead, readingMode]`
  - Third useEffect (line 129): `[readingMode, markAsRead]`

**Step 2: Replace `<img>` elements with Next.js `<Image />`**
- Import `Image` from `next/image`.
- Replace the `<img>` inside `scroll-view` and `page-view` wrapper with `<Image />`.
- Set props: `unoptimized={true}`, `width={0}`, `height={0}`, `sizes="100vw"`, `style={{ width: '100%', height: 'auto' }}`. For the page-view image, also add cursor pointer and click handler.
- Verify that `loading` and `priority` props are configured correctly (e.g. `priority={idx < 3}` for list items, and `priority={true}` for page view).

---

### Task 2: Fix DashboardClient.tsx Image warning

**Files:**
- Modify: `src/app/DashboardClient.tsx`

**Step 1: Replace `<img>` elements with Next.js `<Image />`**
- Import `Image` from `next/image`.
- Replace the manga cover `<img>` tag with `<Image />`.
- Set `unoptimized={true}`, `fill={true}`, `sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"`, and ensure styling maintains cover layout.

---

### Task 3: Fix SeriesClient.tsx Image warning

**Files:**
- Modify: `src/app/series/[seriesId]/SeriesClient.tsx`

**Step 1: Replace `<img>` elements with Next.js `<Image />`**
- Import `Image` from `next/image`.
- Replace the series cover `<img>` tag with `<Image />`.
- Set `unoptimized={true}`, `width={200}`, `height={300}`, and `priority={true}`.

---

### Task 4: Run verification and linting

**Step 1: Run linter**
- Run: `npm run lint`
- Expected: 0 problems / warnings.

**Step 2: Run build**
- Run: `npm run build`
- Expected: Successfully compiled.
