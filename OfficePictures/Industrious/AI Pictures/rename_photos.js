/**
 * ============================================================
 *  Industrious NYC - Photo Renamer
 * ============================================================
 *  Visits each location gallery, reads the correct labels,
 *  and renames existing photos with the right room type.
 *
 *  RUN:  node rename_photos.js
 * ============================================================
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const SAVE_DIR = path.join(
  os.homedir(),
  'Documents', 'VBP WebSite', 'OfficePictures', 'Industrious', 'AI Pictures'
);

const NYC_LOCATIONS = {
  '190-bowery-1st-floor-new-york':            '190Bowery',
  '156-5th-avenue-4th-floor-new-york':        '156_5thAve',
  '875-3rd-avenue-6th-floor-new-york':        '875_3rdAve',
  '2-dean-st-suite-101':                      '2DeanSt',
  '11-park-place-new-york':                   '11ParkPlace',
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

function extractId(filename) {
  // Get the image ID part from existing filename
  // Format: Prefix-RoomType-ImageID.jpg
  const parts = filename.replace('.jpg', '').split('-');
  // Last part(s) after the room type is the image ID
  // Image IDs are hex strings
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].match(/^[a-f0-9]{8,}/i)) {
      return parts.slice(i).join('');
    }
  }
  return parts[parts.length - 1];
}

async function getGalleryLabels(page, slug) {
  const url = BASE_URL + slug;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(3000);

  // Click Gallery button
  try {
    const btn = await page.$('button:has-text("Gallery"), a:has-text("Gallery")');
    if (btn) { await btn.click(); await sleep(2000); }
  } catch(e) {}

  // Scroll to load all images
  await page.evaluate(async () => {
    for (let i = 0; i < 50; i++) {
      window.scrollBy(0, 300);
      await new Promise(r => setTimeout(r, 100));
    }
  });
  await sleep(2000);

  // Get all gallery images with their labels AND image IDs from URLs
  const items = await page.evaluate(() => {
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
      if (!src.includes('inventory-service')) return; // only gallery images

      const key = src.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);

      // Extract image ID from URL
      const imgIdMatch = src.match(/\/([a-f0-9]{24})\./);
      const imgId = imgIdMatch ? imgIdMatch[1] : '';

      // Find label below the image
      let label = '';
      let container = img.parentElement;
      for (let depth = 0; depth < 8; depth++) {
        if (!container) break;
        const next = container.nextElementSibling;
        if (next) {
          const txt = next.textContent.trim();
          if (txt.length > 1 && txt.length < 60 &&
              !txt.includes('Reserve') &&
              !txt.includes('Book') &&
              !txt.includes('Tour') &&
              !txt.includes('360') &&
              !txt.includes('©') &&
              !txt.includes('http')) {
            label = txt;
            break;
          }
        }
        const cap = container.querySelector('figcaption, [class*="caption"], [class*="label"]');
        if (cap && cap.textContent.trim().length < 60) {
          label = cap.textContent.trim();
          break;
        }
        container = container.parentElement;
      }

      if (!label && img.alt && img.alt.length > 2 && img.alt.length < 60) {
        label = img.alt;
      }

      results.push({ imgId, label, src });
    });

    return results;
  });

  return items;
}

(async () => {
  console.log('=======================================================');
  console.log('  Industrious NYC - Photo Renamer');
  console.log(`  Folder: ${SAVE_DIR}`);
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

  let totalRenamed = 0;
  let totalSkipped = 0;
  const slugs = Object.keys(NYC_LOCATIONS);

  for (let i = 0; i < slugs.length; i++) {
    const slug   = slugs[i];
    const prefix = NYC_LOCATIONS[slug];

    console.log(`\n[${String(i+1).padStart(2,'0')}/${slugs.length}] ${slug}`);

    try {
      const items = await getGalleryLabels(page, slug);
      console.log(`  Found ${items.length} gallery items`);

      // Get existing files for this prefix
      const existingFiles = fs.readdirSync(SAVE_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.jpg'));

      console.log(`  Existing files: ${existingFiles.length}`);

      // Match by image ID and rename
      for (const item of items) {
        if (!item.imgId || !item.label) continue;

        const roomType = labelToCamel(item.label);
        
        // Find existing file with this image ID
        const match = existingFiles.find(f => f.includes(item.imgId));
        if (!match) continue;

        const newName = `${prefix}-${roomType}-${item.imgId}.jpg`;
        
        if (match === newName) {
          totalSkipped++;
          continue; // Already correct name
        }

        const oldPath = path.join(SAVE_DIR, match);
        const newPath = path.join(SAVE_DIR, newName);

        // Don't overwrite if new name already exists
        if (fs.existsSync(newPath) && match !== newName) {
          console.log(`  ⚠ Skip (exists): ${newName}`);
          continue;
        }

        fs.renameSync(oldPath, newPath);
        totalRenamed++;
        console.log(`  ✓ ${match}`);
        console.log(`    → ${newName}`);
      }

    } catch(err) {
      console.log(`  ✗ Error: ${err.message}`);
    }

    await sleep(1500);
  }

  await browser.close();

  console.log('\n=======================================================');
  console.log('  ALL DONE!');
  console.log(`  Renamed : ${totalRenamed} files`);
  console.log(`  Skipped : ${totalSkipped} (already correct)`);
  console.log('=======================================================');
})();
