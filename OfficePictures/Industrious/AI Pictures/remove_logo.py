"""
============================================================
 Industrious Logo Remover - Fast Version
============================================================
 Removes INDUSTRIOUS logo/text from office photos.
 Skips files already in _originals_backup (already processed).
 Backs up originals first, then processes all JPGs.

 RUN:  python remove_logo.py
============================================================
"""

import cv2
import numpy as np
import os
import shutil

PICTURES_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR   = os.path.join(PICTURES_DIR, '_originals_backup')

def detect_industrious_logo(img_bgr):
    """
    Detect INDUSTRIOUS logo text on walls - any color.
    Uses multiple strategies since logo color varies by location.
    Returns mask where white = pixels to remove.
    """
    h, w = img_bgr.shape[:2]
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    combined = np.zeros((h, w), dtype=np.uint8)

    # ── Strategy 1: Gold/brass letters ───────────────────────────────────────
    gold = cv2.inRange(hsv, np.array([10, 30, 80]),  np.array([38, 255, 255]))
    combined = cv2.bitwise_or(combined, gold)

    # ── Strategy 2: White letters on dark background ──────────────────────────
    _, white = cv2.threshold(gray, 210, 255, cv2.THRESH_BINARY)
    _, dark_bg = cv2.threshold(gray, 60, 255, cv2.THRESH_BINARY_INV)
    # White text sitting on dark areas
    white_on_dark = cv2.bitwise_and(white, dark_bg)
    combined = cv2.bitwise_or(combined, white_on_dark)

    # ── Strategy 3: Dark green letters ────────────────────────────────────────
    dark_green = cv2.inRange(hsv, np.array([35, 30, 20]), np.array([85, 255, 130]))
    combined = cv2.bitwise_or(combined, dark_green)

    # ── Strategy 4: Black letters on light wall ───────────────────────────────
    _, black = cv2.threshold(gray, 40, 255, cv2.THRESH_BINARY_INV)
    _, light_bg = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY)
    black_on_light = cv2.bitwise_and(black, light_bg)
    combined = cv2.bitwise_or(combined, black_on_light)

    # ── Clean up and find letter-shaped regions ───────────────────────────────
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    clean_mask = np.zeros((h, w), dtype=np.uint8)
    letter_regions = []

    for cnt in contours:
        area = cv2.contourArea(cnt)
        x, y, cw, ch = cv2.boundingRect(cnt)
        if area < 30: continue
        if area > w * h * 0.05: continue
        aspect = cw / max(ch, 1)
        if aspect > 8: continue
        letter_regions.append((x, y, cw, ch))
        cv2.drawContours(clean_mask, [cnt], -1, 255, -1)

    # ── Group letters into logo bounding box ──────────────────────────────────
    if letter_regions:
        xs  = [r[0] for r in letter_regions]
        ys  = [r[1] for r in letter_regions]
        x2s = [r[0]+r[2] for r in letter_regions]
        y2s = [r[1]+r[3] for r in letter_regions]

        gx  = min(xs);  gy  = min(ys)
        gx2 = max(x2s); gy2 = max(y2s)
        gw  = gx2 - gx; gh  = gy2 - gy

        if gw > w * 0.03:
            # Expand to cover icon above text and padding around
            pad_top    = int(gh * 1.5)
            pad_sides  = int(gw * 0.05)
            pad_bottom = int(gh * 0.3)

            rx1 = max(0, gx  - pad_sides)
            ry1 = max(0, gy  - pad_top)
            rx2 = min(w, gx2 + pad_sides)
            ry2 = min(h, gy2 + pad_bottom)

            cv2.rectangle(clean_mask, (rx1, ry1), (rx2, ry2), 255, -1)

    # Dilate slightly to cover edges
    kernel_d = cv2.getStructuringElement(cv2.MORPH_RECT, (20, 20))
    clean_mask = cv2.dilate(clean_mask, kernel_d, iterations=1)

    return clean_mask


def process_image(filepath):
    img = cv2.imread(filepath)
    if img is None:
        return False, 'could not read'

    h, w = img.shape[:2]

    # Work at reduced size for speed
    scale = min(1.0, 1024 / w)
    small = cv2.resize(img, (int(w*scale), int(h*scale))) if scale < 1.0 else img.copy()

    small_mask = detect_industrious_logo(small)

    mask_ratio = np.sum(small_mask > 0) / small_mask.size
    if mask_ratio < 0.0005:
        return False, 'no logo detected'
    if mask_ratio > 0.5:
        return False, f'mask too large ({mask_ratio:.1%})'

    full_mask = cv2.resize(small_mask, (w, h), interpolation=cv2.INTER_NEAREST) if scale < 1.0 else small_mask

    result = cv2.inpaint(img, full_mask, inpaintRadius=20, flags=cv2.INPAINT_TELEA)
    cv2.imwrite(filepath, result, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return True, f'{mask_ratio:.2%} of image'


def main():
    print('=======================================================')
    print('  Industrious Logo Remover')
    print(f'  Folder: {PICTURES_DIR}')
    print('=======================================================\n')

    os.makedirs(BACKUP_DIR, exist_ok=True)

    jpg_files = sorted([
        f for f in os.listdir(PICTURES_DIR)
        if f.lower().endswith('.jpg') and not f.startswith('_')
    ])

    if not jpg_files:
        print('No JPG files found!')
        return

    print(f'Found {len(jpg_files)} images total')

    # Skip files already backed up (already processed)
    already_done = set(os.listdir(BACKUP_DIR))
    todo = [f for f in jpg_files if f not in already_done]
    skip_count = len(jpg_files) - len(todo)

    print(f'Already processed: {skip_count} (skipping)')
    print(f'To process: {len(todo)}\n')

    removed = 0
    skipped = 0
    errors  = 0

    for i, fname in enumerate(todo):
        fpath = os.path.join(PICTURES_DIR, fname)
        print(f'[{i+1:03d}/{len(todo)}] {fname}')

        # Backup original
        shutil.copy2(fpath, os.path.join(BACKUP_DIR, fname))

        try:
            ok, msg = process_image(fpath)
            if ok:
                removed += 1
                print(f'  ✓ Removed ({msg})')
            else:
                skipped += 1
                print(f'  - Skipped: {msg}')
        except Exception as e:
            errors += 1
            print(f'  ✗ Error: {e}')

    print('\n=======================================================')
    print('  ALL DONE!')
    print(f'  Logos removed : {removed}')
    print(f'  No logo found : {skipped}')
    print(f'  Errors        : {errors}')
    print(f'  Originals in  : _originals_backup\\')
    print('=======================================================')

if __name__ == '__main__':
    main()
