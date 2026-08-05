"""
============================================================
 Bevmax - Convert all images to JPEG
============================================================
 Converts all files in the Bevmax folder to JPEG format.
 Saves converted files as .jpg with the same name.

 RUN:  python convert_to_jpeg.py
============================================================
"""

import os
import sys
from PIL import Image

FOLDER = os.path.join(
    os.path.expanduser('~'),
    'Documents', 'VBP WebSite', 'OfficePictures', 'Bevmax'
)

def convert_file(filepath):
    """Try to open any file as an image and save as JPEG."""
    try:
        img = Image.open(filepath)
        # Convert to RGB (required for JPEG)
        if img.mode in ('RGBA', 'LA', 'P'):
            img = img.convert('RGB')
        elif img.mode != 'RGB':
            img = img.convert('RGB')
        
        # Save as JPEG with same name but .jpg extension
        base = os.path.splitext(filepath)[0]
        out_path = base + '.jpg'
        
        # Don't overwrite if already a jpg
        if filepath.lower().endswith('.jpg') and os.path.exists(out_path):
            return False, 'already jpg'
        
        img.save(out_path, 'JPEG', quality=92)
        return True, out_path
    except Exception as e:
        return False, str(e)

def main():
    print('=======================================================')
    print('  Bevmax - Convert to JPEG')
    print(f'  Folder: {FOLDER}')
    print('=======================================================\n')

    if not os.path.exists(FOLDER):
        print(f'Folder not found: {FOLDER}')
        return

    # Get all files (skip already converted .jpg files and hidden files)
    all_files = [
        f for f in os.listdir(FOLDER)
        if os.path.isfile(os.path.join(FOLDER, f))
        and not f.startswith('.')
        and not f.endswith('.py')
        and not f.endswith('.js')
        and not f.endswith('.json')
    ]

    print(f'Found {len(all_files)} files\n')

    converted = 0
    skipped   = 0
    failed    = 0

    for i, fname in enumerate(sorted(all_files)):
        fpath = os.path.join(FOLDER, fname)
        print(f'[{i+1:03d}/{len(all_files)}] {fname}')

        # Skip if already a proper JPEG
        if fname.lower().endswith('.jpg') or fname.lower().endswith('.jpeg'):
            print(f'  - Already JPEG, skipping')
            skipped += 1
            continue

        ok, result = convert_file(fpath)
        if ok:
            converted += 1
            new_name = os.path.basename(result)
            print(f'  ✓ Converted → {new_name}')
            # Delete original non-jpg file after successful conversion
            os.remove(fpath)
        else:
            failed += 1
            print(f'  ✗ Failed: {result}')

    print('\n=======================================================')
    print('  ALL DONE!')
    print(f'  Converted : {converted}')
    print(f'  Skipped   : {skipped} (already JPEG)')
    print(f'  Failed    : {failed}')
    print('=======================================================')

if __name__ == '__main__':
    main()
