"""
============================================================
 Regus NYC - Room Type Detector (Free - No API needed)
============================================================
 Analyzes each photo using color, brightness and shape
 detection to identify room types and rename files.

 RUN:  python detect_rooms.py
============================================================
"""

import cv2
import numpy as np
import os
import re
from pathlib import Path

PICTURES_DIR = os.path.join(
    os.path.expanduser('~'),
    'Documents', 'VBP WebSite', 'OfficePictures', 'Regus'
)

def analyze_room(img_bgr):
    """
    Analyze image to determine room type.
    Returns (room_type, confidence)
    """
    h, w = img_bgr.shape[:2]
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    hsv  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    scores = {
        'Reception':      0,
        'MeetingRoom':    0,
        'ConferenceRoom': 0,
        'PrivateOffice':  0,
        'CommonArea':     0,
        'PhoneBooth':     0,
        'Lounge':         0,
        'Coworking':      0,
        'Corridor':       0,
        'Kitchen':        0,
    }

    # ── Feature 1: Overall brightness ────────────────────────────────────────
    brightness = np.mean(gray)
    # Dark images = phone booths or corridors
    if brightness < 80:
        scores['PhoneBooth'] += 2
        scores['Corridor']   += 1
    elif brightness > 160:
        scores['CommonArea'] += 1
        scores['Reception']  += 1

    # ── Feature 2: Color analysis ─────────────────────────────────────────────
    # Warm colors (orange/red/yellow tones) = lounge/common area
    warm = cv2.inRange(hsv, np.array([5,50,80]), np.array([35,255,255]))
    warm_ratio = np.sum(warm > 0) / (h * w)
    if warm_ratio > 0.08:
        scores['Lounge']     += 3
        scores['CommonArea'] += 2

    # Cool blues/grays = office/meeting room
    cool = cv2.inRange(hsv, np.array([90,20,80]), np.array([130,255,255]))
    cool_ratio = np.sum(cool > 0) / (h * w)
    if cool_ratio > 0.05:
        scores['MeetingRoom']  += 2
        scores['PrivateOffice'] += 1

    # White/neutral walls = office spaces
    _, white = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    white_ratio = np.sum(white > 0) / (h * w)
    if white_ratio > 0.35:
        scores['PrivateOffice']  += 2
        scores['MeetingRoom']    += 1
        scores['Reception']      += 1

    # ── Feature 3: Horizontal line detection (tables, desks) ─────────────────
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=80,
                             minLineLength=w//5, maxLineGap=20)

    h_lines = 0  # horizontal lines
    v_lines = 0  # vertical lines

    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            angle = abs(np.degrees(np.arctan2(y2-y1, x2-x1)))
            if angle < 15 or angle > 165:
                h_lines += 1
            elif 75 < angle < 105:
                v_lines += 1

    # Many horizontal lines = tables (meeting/conference room)
    if h_lines > 8:
        scores['MeetingRoom']    += 3
        scores['ConferenceRoom'] += 2
    elif h_lines > 4:
        scores['MeetingRoom']    += 1
        scores['Coworking']      += 1

    # Many vertical lines = office cubicles or corridors
    if v_lines > 10:
        scores['Coworking'] += 2
        scores['Corridor']  += 1

    # ── Feature 4: Image aspect and composition ───────────────────────────────
    aspect = w / h

    # Very wide images = panoramic common areas
    if aspect > 2.0:
        scores['CommonArea'] += 2
        scores['Coworking']  += 1

    # ── Feature 5: Bottom half analysis (floor/furniture) ────────────────────
    bottom_half = img_bgr[h//2:, :]
    bottom_gray = gray[h//2:, :]

    # Check for chairs (dark rounded shapes in bottom)
    _, dark = cv2.threshold(bottom_gray, 60, 255, cv2.THRESH_BINARY_INV)
    dark_ratio = np.sum(dark > 0) / dark.size

    if dark_ratio > 0.25:
        scores['MeetingRoom']    += 2
        scores['ConferenceRoom'] += 1
        scores['Lounge']         += 1

    # ── Feature 6: Center region analysis ────────────────────────────────────
    center = img_bgr[h//4:3*h//4, w//4:3*w//4]
    center_bright = np.mean(cv2.cvtColor(center, cv2.COLOR_BGR2GRAY))

    # Bright center with dark edges = spotlight on desk (private office)
    edge_bright = (np.mean(gray[:h//4]) + np.mean(gray[3*h//4:])) / 2
    if center_bright > edge_bright + 20:
        scores['PrivateOffice'] += 2
        scores['Reception']     += 1

    # ── Feature 7: Glass/partition detection ─────────────────────────────────
    # Glass walls = modern office spaces
    glass_color = cv2.inRange(hsv, np.array([85,5,150]), np.array([115,60,255]))
    glass_ratio = np.sum(glass_color > 0) / (h * w)
    if glass_ratio > 0.05:
        scores['PrivateOffice']  += 2
        scores['MeetingRoom']    += 1
        scores['CommonArea']     += 1

    # ── Feature 8: Image height zones ────────────────────────────────────────
    # Top third - ceiling analysis
    top_third = gray[:h//3, :]
    top_bright = np.mean(top_third)

    # Very bright top = high windows / open office
    if top_bright > 180:
        scores['CommonArea'] += 1
        scores['Coworking']  += 1

    # ── Pick winner ───────────────────────────────────────────────────────────
    best_type  = max(scores, key=scores.get)
    best_score = scores[best_type]

    # Normalize confidence
    total = sum(scores.values()) or 1
    confidence = best_score / total

    return best_type, confidence, scores


def process_file(filepath):
    """Analyze one image and return detected room type."""
    img = cv2.imread(filepath)
    if img is None:
        return None, 0

    # Work at smaller size for speed
    h, w = img.shape[:2]
    scale = min(1.0, 800 / max(w, h))
    if scale < 1.0:
        small = cv2.resize(img, (int(w*scale), int(h*scale)))
    else:
        small = img

    room_type, confidence, scores = analyze_room(small)
    return room_type, confidence


def main():
    print('=======================================================')
    print('  Regus NYC - Room Type Detector (Free)')
    print(f'  Folder: {PICTURES_DIR}')
    print('=======================================================\n')

    if not os.path.exists(PICTURES_DIR):
        print(f'Folder not found: {PICTURES_DIR}')
        return

    # Get all Photo-labeled JPGs
    all_files = sorted([
        f for f in os.listdir(PICTURES_DIR)
        if f.endswith('.jpg') and '-Photo-' in f
    ])

    print(f'Found {len(all_files)} photos to identify\n')

    if not all_files:
        print('No files with -Photo- label found!')
        return

    renamed = 0
    failed  = 0

    for i, fname in enumerate(all_files):
        fpath = os.path.join(PICTURES_DIR, fname)
        print(f'[{i+1:03d}/{len(all_files)}] {fname}')

        try:
            room_type, confidence = process_file(fpath)
            if not room_type:
                print(f'  Could not read image')
                failed += 1
                continue

            print(f'  Detected: {room_type} (confidence: {confidence:.0%})')

            # Build new filename
            new_name = fname.replace('-Photo-', f'-{room_type}-')
            new_path = os.path.join(PICTURES_DIR, new_name)

            if os.path.exists(new_path):
                print(f'  Skip (exists): {new_name}')
            else:
                os.rename(fpath, new_path)
                renamed += 1
                print(f'  → {new_name}')

        except Exception as e:
            print(f'  Error: {e}')
            failed += 1

    print('\n=======================================================')
    print('  ALL DONE!')
    print(f'  Renamed : {renamed}')
    print(f'  Failed  : {failed}')
    print('=======================================================')


if __name__ == '__main__':
    main()
