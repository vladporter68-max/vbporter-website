/**
 * ============================================================
 *  Regus NYC - Location Gallery Image Scraper
 * ============================================================
 *
 *  SETUP (run once):
 *    npm install playwright sharp
 *    npx playwright install chromium
 *
 *  RUN:
 *    node scrape_regus_nyc.js
 *
 *  SAVES TO:
 *    C:\Users\Amazon\Documents\VBP WebSite\OfficePictures\Regus\
 *
 *  NAMING FORMAT:
 *    57West57St-MeetingRoom-1763_3.jpg
 *    445ParkAve-PrivateOffice-1161_5.jpg
 * ============================================================
 */

const { chromium } = require('playwright');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const os    = require('os');

// ── Save location ─────────────────────────────────────────────────────────────
const SAVE_DIR = path.join(
  os.homedir(),
  'Documents', 'VBP WebSite', 'OfficePictures', 'Regus'
);

// ── KEEP these room types ─────────────────────────────────────────────────────
const KEEP_TYPES = [
  'office', 'private', 'suite', 'conference', 'meeting', 'phone',
  'booth', 'reception', 'common', 'lounge', 'cowork', 'workspace',
  'breakout', 'collaboration', 'training', 'boardroom', 'team',
  'focus', 'desk', 'interior', 'room', 'area', 'space', 'open plan'
];

// ── SKIP these types ──────────────────────────────────────────────────────────
const SKIP_TYPES = [
  'building', 'exterior', 'outside', 'street', 'floor plan',
  'floorplan', 'map', 'aerial', 'facade', 'entrance from street',
  'lobby from street', 'neighborhood', 'city', 'skyline', 'view from',
  'virtual office', 'product', 'generic', 'stock'
];

// ── All NYC Regus locations ───────────────────────────────────────────────────
const NYC_LOCATIONS = [
  { id: '1763', prefix: '57West57St',        address: '57 West 57th Street' },
  { id: '2153', prefix: '1325AveOfAmericas', address: '1325 Avenue of the Americas' },
  { id: '1161', prefix: '445ParkAve',        address: '445 Park Avenue' },
  { id: '1679', prefix: '477MadisonAve',     address: '477 Madison Avenue' },
  { id: '1162', prefix: '1RockefellerPlaza', address: '1 Rockefeller Plaza' },
  { id: '1273', prefix: '845_3rdAve',        address: '845 3rd Avenue' },
  { id: '2451', prefix: '1177AveOfAmericas', address: '1177 Avenue of the Americas' },
  { id: '1508', prefix: '250ParkAve',        address: '250 Park Avenue' },
  { id: '1375', prefix: '1501Broadway',      address: '1501 Broadway' },
  { id: '1159', prefix: '230ParkAve',        address: '230 Park Avenue' },
  { id: '1157', prefix: '405LexingtonAve',   address: '405 Lexington Avenue' },
  { id: '1158', prefix: '100ParkAve',        address: '100 Park Avenue' },
  { id: '921',  prefix: '260MadisonAve',     address: '260 Madison Avenue' },
  { id: '1614', prefix: '600_3rdAve',        address: '600 3rd Avenue' },
  { id: '1740', prefix: '1740Broadway',      address: '1740 Broadway' },
  { id: '1163', prefix: '590MadisonAve',     address: '590 Madison Avenue' },
  { id: '672',  prefix: '5PennPlaza',        address: '5 Penn Plaza' },
  { id: '1801', prefix: '112West34St',       address: '112 West 34th Street' },
  { id: '2197', prefix: '1250Broadway',      address: '1250 Broadway' },
  { id: '1618', prefix: '41MadisonAve',      address: '41 Madison Avenue' },
  { id: '1385', prefix: '100ChurchSt',       address: '100 Church Street' },
  { id: '1166', prefix: '140Broadway',       address: '140 Broadway' },
  { id: '1164', prefix: '14WallSt',          address: '14 Wall Street' },
  { id: '1165', prefix: '80BroadSt',         address: '80 Broad Street' },
  { id: '1565', prefix: '99HudsonSt',        address: '99 Hudson Street' },
  { id: '4270', prefix: '41FlatbushAve',     address: '41 Flatbush Avenue Brooklyn' },
  { id: '4271', prefix: '130_3rdStBklyn',    address: '130 3rd Street Brooklyn' },
  { id: '4272', prefix: '175PearlStDumbo',   address: '175 Pearl Street Dumbo' },
  { id: '4273', prefix: '300CadmanPlaza',    address: '300 Cadman Plaza West' },
];

const CDN_BASE = 'https://assets.iwgplc.com/image/upload';
const DELAY_MS = 1500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Check if image label is a room we want ────────────────────────────────────
function shouldKeep(label) {
  if (!label) return true; // no label = keep (we'll check visually)
  const lower = label.toLowerCase();

  // Skip if matches skip types
  if (SKIP_TYPES.some(s => lower.includes(s))) return false;

  // Keep if matches keep types
  if (KEEP_TYPES.some(k => lower.includes(k))) return true;

  // If label exists but doesn't match either list, keep it
  return true;
}

function labelToCamel(label) {
  if (!label) return 'Photo';
  return label
    .replace(/regus/gi, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const chunks = [];
    const req = proto.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      }
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
        return downloadBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

let sharp;
try { sharp = require('sharp'); }
catch(e) { console.error('\nRun: npm install sharp\n'); process.exit(1); }

async function toJpeg(buffer) {
  return sharp(buffer).jpeg({ quality: 92 }).toBuffer();
}

function fullResUrl(centreId, imgNum) {
  return `${CDN_BASE}/f_auto,q_auto//CentreImagery/${centreId}/${centreId}_${imgNum}.jpg`;
}

async function scrapeLocation(page, loc) {
  const url = `https://www.regus.com/en/us/${loc.id}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Scroll to load all content
  await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      window.scrollBy(0, 400);
      await new Promise(r => setTimeout(r, 100));
    }
  });
  await sleep(2000);

  // Extract all gallery images with labels
  const images = await page.evaluate((centreId) => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.currentSrc || '';
      if (!src.includes('CentreImagery')) return;
      if (!src.includes(`/${centreId}/`)) return;

      const key = src.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);

      const numMatch = src.match(new RegExp(`${centreId}_(\\d+)\\.`));
      const imgNum = numMatch ? numMatch[1] : '1';

      // Get label from alt text
      let label = img.alt || '';

      // Look for nearby caption text
      let container = img.parentElement;
      for (let depth = 0; depth < 5; depth++) {
        if (!container) break;
        const cap = container.querySelector('p, span, [class*="caption"], [class*="label"], [class*="title"]');
        if (cap) {
          const txt = cap.textContent.trim();
          if (txt.length > 2 && txt.length < 60) { label = txt; break; }
        }
        container = container.parentElement;
      }

      results.push({ imgNum, label, src });
    });

    // Also find images from page source that may not be in DOM yet
    const html = document.documentElement.innerHTML;
    const pattern = new RegExp(`CentreImagery/${centreId}/${centreId}_(\\d+)\\.`, 'g');
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const imgNum = match[1];
      const key = `${centreId}_${imgNum}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ imgNum, label: '', src: '' });
      }
    }

    return results;
  }, loc.id);

  // Filter to only room types we want
  const filtered = images.filter(img => shouldKeep(img.label));

  console.log(`  Found ${images.length} images, keeping ${filtered.length} room photos`);
  return filtered;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(SAVE_DIR, { recursive: true });

  console.log('=======================================================');
  console.log('  Regus NYC - Gallery Image Scraper');
  console.log(`  Saving to: ${SAVE_DIR}`);
  console.log(`  Locations: ${NYC_LOCATIONS.length}`);
  console.log('=======================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  let totalSaved   = 0;
  let totalSkipped = 0;
  let totalFailed  = 0;

  for (let i = 0; i < NYC_LOCATIONS.length; i++) {
    const loc = NYC_LOCATIONS[i];
    console.log(`\n[${String(i+1).padStart(2,'0')}/${NYC_LOCATIONS.length}] ${loc.address}`);

    try {
      const images   = await scrapeLocation(page, loc);
      const usedNames = new Set();

      for (const item of images) {
        await sleep(300);

        const roomType = labelToCamel(item.label) || 'Photo';
        const imgRef   = `${loc.id}_${item.imgNum}`;
        let   base     = `${loc.prefix}-${roomType}-${imgRef}`;

        if (usedNames.has(base)) {
          let n = 2;
          while (usedNames.has(`${base}-${n}`)) n++;
          base = `${base}-${n}`;
        }
        usedNames.add(base);

        const filename = `${base}.jpg`;
        const savePath = path.join(SAVE_DIR, filename);

        if (fs.existsSync(savePath)) {
          console.log(`  skip: ${filename}`);
          totalSkipped++;
          continue;
        }

        try {
          const dlUrl = fullResUrl(loc.id, item.imgNum);
          const buf   = await downloadBuffer(dlUrl);
          const jpeg  = await toJpeg(buf);
          fs.writeFileSync(savePath, jpeg);
          totalSaved++;
          console.log(`  SAVED: ${filename}  (${Math.round(jpeg.length/1024)} KB)`);
        } catch(err) {
          totalFailed++;
          console.log(`  FAILED: ${filename} - ${err.message}`);
        }
      }

    } catch(err) {
      console.log(`  Error: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  await browser.close();

  console.log('\n=======================================================');
  console.log('  ALL DONE!');
  console.log(`  Saved:   ${totalSaved} images`);
  console.log(`  Skipped: ${totalSkipped} already existed`);
  console.log(`  Failed:  ${totalFailed}`);
  console.log(`  Folder:  ${SAVE_DIR}`);
  console.log('=======================================================');
})();
