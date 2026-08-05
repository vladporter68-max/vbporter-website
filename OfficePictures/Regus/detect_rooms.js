/**
 * ============================================================
 *  Regus NYC - AI Room Type Detector & Renamer
 * ============================================================
 *  Uses Claude AI to look at each photo and identify the
 *  room type, then renames the file accordingly.
 *
 *  RUN:
 *    node detect_rooms.js
 * ============================================================
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const os    = require('os');

const PICTURES_DIR = path.join(
  os.homedir(),
  'Documents', 'VBP WebSite', 'OfficePictures', 'Regus'
);

const DELAY_MS = 1000; // delay between API calls
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Call Claude API to identify room type ─────────────────────────────────────
async function identifyRoomType(imageBase64, filename) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: `Look at this office space photo and identify the room type. 
Reply with ONLY one of these exact labels (no other text):
- PrivateOffice
- MeetingRoom
- ConferenceRoom
- CommonArea
- Reception
- PhoneBooth
- Lounge
- Coworking
- Suite
- Boardroom
- TrainingRoom
- Corridor
- Kitchen
- BuildingExterior
- Other

Reply with just the label, nothing else.`
          }
        ]
      }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY || ''
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error.message));
            return;
          }
          const text = json.content?.[0]?.text?.trim() || 'Other';
          resolve(text);
        } catch(e) {
          reject(new Error('Failed to parse response: ' + data.substring(0, 100)));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('=======================================================');
  console.log('  Regus NYC - AI Room Type Detector');
  console.log(`  Folder: ${PICTURES_DIR}`);
  console.log('=======================================================\n');

  // Check API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ERROR: ANTHROPIC_API_KEY not set!');
    console.log('Set it by typing this in terminal first:');
    console.log('  set ANTHROPIC_API_KEY=your-api-key-here');
    console.log('\nGet your API key from: https://console.anthropic.com');
    process.exit(1);
  }

  // Get all Photo-labeled JPGs that need renaming
  const allFiles = fs.readdirSync(PICTURES_DIR)
    .filter(f => f.endsWith('.jpg') && f.includes('-Photo-'));

  console.log(`Found ${allFiles.length} photos to identify\n`);

  if (allFiles.length === 0) {
    console.log('No files with -Photo- label found. All already renamed!');
    return;
  }

  let renamed  = 0;
  let skipped  = 0;
  let failed   = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const fname = allFiles[i];
    const fpath = path.join(PICTURES_DIR, fname);

    console.log(`[${String(i+1).padStart(3,'0')}/${allFiles.length}] ${fname}`);

    try {
      // Read image as base64
      const imgBuffer = fs.readFileSync(fpath);
      // Resize to smaller size for API (max 1MB)
      const base64 = imgBuffer.toString('base64');

      // Ask Claude what room type this is
      const roomType = await identifyRoomType(base64, fname);
      console.log(`  Detected: ${roomType}`);

      // Skip building exteriors and other non-room types
      if (roomType === 'BuildingExterior' || roomType === 'Other') {
        console.log(`  → Skipping (not a room type we want)`);
        skipped++;
        await sleep(DELAY_MS);
        continue;
      }

      // Build new filename by replacing -Photo- with the detected room type
      const newName = fname.replace('-Photo-', `-${roomType}-`);
      const newPath = path.join(PICTURES_DIR, newName);

      if (fs.existsSync(newPath)) {
        console.log(`  → Skip (already exists): ${newName}`);
        skipped++;
      } else {
        fs.renameSync(fpath, newPath);
        renamed++;
        console.log(`  → Renamed to: ${newName}`);
      }

    } catch(err) {
      failed++;
      console.log(`  → ERROR: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n=======================================================');
  console.log('  ALL DONE!');
  console.log(`  Renamed : ${renamed}`);
  console.log(`  Skipped : ${skipped}`);
  console.log(`  Failed  : ${failed}`);
  console.log('=======================================================');
})();
