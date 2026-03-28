#!/usr/bin/env node
/**
 * Generates the marketplace output under /marketplace:
 *   marketplace/scripts/<path>/manifest.json  (+ marketplace.webp if PNG present)
 *   marketplace/categories/<slug>.json         (one per category)
 *   marketplace/marketplace.json               (root index)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POWERS_DIR = path.join(ROOT, 'powers');
const MARKETPLACE_DIR = path.join(ROOT, 'marketplace');
const SCRIPTS_DIR = path.join(MARKETPLACE_DIR, 'scripts');
const CATEGORIES_DIR = path.join(MARKETPLACE_DIR, 'categories');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a category label into a safe filename slug, e.g. "Social Media" → "social-media" */
function toSlug(category) {
  return category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Recursively find every directory that contains a manifest.json */
function findManifestDirs(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === '_internal') continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, 'manifest.json'))) {
      results.push(child);
    } else {
      findManifestDirs(child, results);
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// Clean and recreate output directories
fs.rmSync(MARKETPLACE_DIR, { recursive: true, force: true });
fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
fs.mkdirSync(CATEGORIES_DIR, { recursive: true });

const manifestDirs = findManifestDirs(POWERS_DIR);

// categories map: slug → { label, scripts[] }
const categories = new Map();

for (const dir of manifestDirs) {
  // Relative path from powers/, e.g. "testing/charts-python"
  const rel = path.relative(POWERS_DIR, dir);

  // --- Copy entire script folder (excluding PNG — we convert to WebP instead) ---
  const destDir = path.join(SCRIPTS_DIR, rel);
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) continue; // manifest dirs are flat
    const srcFile = path.join(dir, entry.name);
    if (entry.name.toLowerCase().endsWith('.png')) continue; // handled below
    fs.copyFileSync(srcFile, path.join(destDir, entry.name));
  }

  // Convert marketplace.png → marketplace.webp if it exists
  const srcPng = path.join(dir, 'marketplace.png');
  const hasImage = fs.existsSync(srcPng);
  if (hasImage) {
    const destWebp = path.join(destDir, 'marketplace.webp');
    await sharp(srcPng).webp({ quality: 60, effort: 6 }).toFile(destWebp);
  }

  // --- Parse manifest ---
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const { name, description, icon, category } = manifest;

  if (!category) {
    console.warn(`  [warn] No category in ${rel}/manifest.json — skipping`);
    continue;
  }

  const slug = toSlug(category);

  if (!categories.has(slug)) {
    categories.set(slug, { label: category, scripts: [] });
  }

  // Paths are relative to the repo root (forward slashes, no leading slash)
  const scriptPath = `marketplace/scripts/${rel}/manifest.json`.replace(/\\/g, '/');
  const imagePath = `marketplace/scripts/${rel}/marketplace.webp`.replace(/\\/g, '/');

  categories.get(slug).scripts.push({
    name,
    description,
    ...(icon ? { icon } : {}),
    category,
    path: scriptPath,
    ...(hasImage ? { image: imagePath } : {}),
  });
}

// --- Write category files ---
for (const [slug, { scripts }] of categories) {
  const outPath = path.join(CATEGORIES_DIR, `${slug}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ scripts }, null, 2) + '\n');
  console.log(`  [ok] marketplace/categories/${slug}.json  (${scripts.length} script(s))`);
}

// --- Write root index ---
const categoryIndex = [...categories.entries()].map(([slug, { label, scripts }]) => ({
  slug,
  label,
  count: scripts.length,
  path: `marketplace/categories/${slug}.json`,
}));

const indexPath = path.join(MARKETPLACE_DIR, 'marketplace.json');
fs.writeFileSync(indexPath, JSON.stringify({ categories: categoryIndex }, null, 2) + '\n');
console.log(`  [ok] marketplace/marketplace.json  (${categoryIndex.length} categories)`);
