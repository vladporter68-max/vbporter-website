/**
 * ============================================================
 *  Industrious Office – NYC Location Gallery Image Scraper
 * ============================================================
 *  RUN:  node scrape_industrious_nyc.js
 *
 *  NAMING FORMAT:
 *    190Bowery-CommonArea-6a04b49f592910251f48971a.jpg
 *    25West39St-PrivateOffice-649a2df529.jpg
 * ============================================================
 */

const { chromium } = require('playwright');
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const os    = require('os');

const SAVE_DIR = path.join(
  os.homedir(),
  'Documents', 'VBP WebSite', 'OfficePictures', 'Industrious', 'AI Pictures'
);

// All 40 NYC locations: slug -> address prefix
const NYC_LOCATIONS = {
  '190-bowery-1st-floor-new-york':            '190Bowery',
  '156-5th-avenue-4th-floor-new-york':        '156_5thAve',
  '875-3rd-avenue-6th-floor-new-york':        '875_3rdAve',
  '2-dean-st-suite-101':                      '2DeanSt',
  '11-park-place-new-york':                    '11ParkPlace',
  '110-east-42nd-street-new-york':            '110East42St',
  '119-west-24th-street-new-york':            '119West24St',
  '120-east-23rd-street-new-york':            '120East23St',
  '1411-broadway-new-york':                   '1411Broadway',
  '183-madison-new-york':                     '183Madison',
  '1900-broadway-new-york':                   '1900Broadway',
  '200-broadway-3rd-floor':                   '200Broadway',
  '200-west-41st-street-new-york':            '200West41St',
  '215-park-avenue-south-new-york':           '215ParkAveSouth',
  '25-broadway-new-york':                     '25Broadway',
  '250-west-34th-street-3rd-floor':           '250West34St',
  '251-west-30th-street-new-york':            '251West30St',
  '261-madison-avenue-new-york':              '261MadisonAve',
  '386-park-avenue-south-new-york':           '386ParkAveSouth',
  '390-park-avenue-new-york':                 '390ParkAve',
  '540-madison-avenue-new-york':              '540MadisonAve',
  '560-lexington-avenue-new-york':            '560LexingtonAve',
  '609-greenwich-street-4th-floor-new-york':  '609GreenwichSt',
  '107-greenwich-street-14th-floor-new-york': '107GreenwichSt',
  '175-greenwich-street-38th-floor':          '175GreenwichSt',
  '31-hudson-yards-11th-floor':               '31HudsonYards',
  '39th-st-suite-700':                        '39thStSuite700',
  '49th-st-11th-floor':                       '49thSt11thFloor',
  '860-broadway-new-york':                    '860Broadway',
  '902-broadway-new-york':                    '902Broadway',
  '525-washington-blvd-300':                  '525WashingtonBlvd',
};

const BASE_URL = 'https://www.industriousoffice.com/locations/';
const DELAY_MS = 1500;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function labelToCamel(label) {
  if (!label) return 'Photo';
  return label
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function extractId(url) {
  const clean = url.split('?')[0];
  const seg = clean.split('/').pop().replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '');
  if (seg && seg.length >= 6) return seg.substring(0, 24);
  let h = 0;
  for (const c of url) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(16).substring(0, 8);
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

async function scrapeLocation(page, slug, prefix) {
  const url = BASE_URL + slug;
  console.log(`  URL: ${url}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Click Gallery button
  try {
    const btn = await page.$('button:has-text("Gallery"), a:has-text("Gallery")');
    if (btn) { await btn.click(); await sleep(2000); console.log('  Clicked Gallery'); }
  } catch(e) {}

  // Scroll to load all lazy images
  await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      window.scrollBy(0, 300);
      await new Promise(r => setTimeout(r, 100));
    }
  });
  await sleep(2000);

  // Extract images with labels
  const images = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    document.querySelectorAll('img').forEach(img => {
      let src = img.currentSrc || img.src || '';

      // Get highest res from srcset
      if (img.srcset) {
        let bestW = 0;
        img.srcset.split(',').forEach(part => {
          const [u, w] = part.trim().split(/\s+/);
          const width = parseInt(w) || 0;
          if (width > bestW) { bestW = width; src = u; }
        });
      }

      if (!src || src.startsWith('data:') || src.includes('.svg')) return;
      const natW = img.naturalWidth  || img.width  || 0;
      const natH = img.naturalHeight || img.height || 0;
      if (natW < 200 || natH < 100) return;

      const skipWords = ['logo','icon','avatar','mapbox','map','flag','star','spinner','facebook','twitter','instagram','linkedin'];
      if (skipWords.some(s => src.toLowerCase().includes(s))) return;

      const key = src.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);

      // Find label below the image
      let label = '';
      let container = img.parentElement;
      for (let depth = 0; depth < 8; depth++) {
        if (!container) break;

        // Check next sibling for label text
        const next = container.nextElementSibling;
        if (next) {
          const txt = next.textContent.trim();
          if (txt.length > 2 && txt.length < 80 &&
              !txt.includes('Reserve') && !txt.includes('http') &&
              !txt.includes('©') && !txt.includes('Tour') &&
              !txt.includes('360') && !txt.includes('Subscribe')) {
            label = txt;
            break;
          }
        }

        // Check for caption inside container
        const cap = container.querySelector('figcaption, [class*="caption"], [class*="label"], [class*="title"]');
        if (cap) {
          const txt = cap.textContent.trim();
          if (txt.length > 2 && txt.length < 80) { label = txt; break; }
        }

        container = container.parentElement;
      }

      // Fallback to alt text
      if (!label && img.alt && img.alt.length > 2 && img.alt.length < 80) {
        label = img.alt;
      }

      results.push({ src, label });
    });

    return results;
  });

  // Keep only real gallery photos (inventory service or CDN images)
  const gallery = images.filter(img => {
    const url = img.src.toLowerCase();
    return (
      url.includes('inventory-service') ||
      url.includes('contentful') ||
      url.includes('cloudinary') ||
      url.includes('imgix') ||
      (url.includes('cdn') && url.match(/\.(jpg|jpeg|png|webp)/))
    );
  });

  console.log(`  Found ${gallery.length} gallery photos`);
  return gallery;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  fs.mkdirSync(SAVE_DIR, { recursive: true });

  console.log('=======================================================');
  console.log('  Industrious NYC - Gallery Image Scraper');
  console.log(`  Saving to: ${SAVE_DIR}`);
  console.log(`  Locations: ${Object.keys(NYC_LOCATIONS).length}`);
  console.log('=======================================================\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' }
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = await context.newPage();

  let totalSaved   = 0;
  let totalSkipped = 0;
  let totalFailed  = 0;
  const slugs = Object.keys(NYC_LOCATIONS);

  for (let i = 0; i < slugs.length; i++) {
    const slug   = slugs[i];
    const prefix = NYC_LOCATIONS[slug];

    console.log(`\n[${String(i+1).padStart(2,'0')}/${slugs.length}] ${slug}`);

    try {
      const images   = await scrapeLocation(page, slug, prefix);
      const usedNames = new Set();

      for (const item of images) {
        await sleep(300);

        const roomType = labelToCamel(item.label) || 'Photo';
        const imgId    = extractId(item.src);
        let   base     = `${prefix}-${roomType}-${imgId}`;

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
          // Get full resolution URL
          let dlUrl = item.src.replace(/[?&](width|quality|format)=[^&]*/g, '').replace(/[?&]+$/, '');
          // Request max quality
          dlUrl = dlUrl + '?width=2048&quality=100&format=jpg';

          const buf  = await downloadBuffer(dlUrl);
          const jpeg = await toJpeg(buf);
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
