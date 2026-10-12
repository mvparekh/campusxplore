import os
import json
from PIL import Image

def optimize_panoramas():
    project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    pano_dir = os.path.join(project_root, "assets", "panoramas")
    scenes_json_path = os.path.join(project_root, "data", "scenes.json")

    print(f"Project root: {project_root}")
    print(f"Panorama directory: {pano_dir}")

    # List all jpg files
    jpg_files = [f for f in os.listdir(pano_dir) if f.lower().endswith(('.jpg', '.jpeg'))]
    print(f"Found {len(jpg_files)} panorama files to optimize.\n")

    total_before = 0
    total_after = 0
    converted_files = []

    for idx, fname in enumerate(sorted(jpg_files), 1):
        src_path = os.path.join(pano_dir, fname)
        base_name, _ = os.path.splitext(fname)
        dest_fname = f"{base_name}.webp"
        dest_path = os.path.join(pano_dir, dest_fname)

        before_size = os.path.getsize(src_path)
        total_before += before_size

        print(f"[{idx}/{len(jpg_files)}] Converting {fname} ({before_size / (1024*1024):.2f} MB)...")

        with Image.open(src_path) as img:
            orig_w, orig_h = img.size

            # Ensure RGB
            if img.mode != 'RGB':
                img = img.convert('RGB')

            # Resize if wider than 4096px
            if orig_w > 4096:
                target_w = 4096
                target_h = int(round(orig_h * (4096.0 / orig_w)))
                # Standard equirectangular is 2:1 ratio (4096x2048)
                if abs(target_h - 2048) <= 10:
                    target_h = 2048
                print(f"   Resizing from {orig_w}x{orig_h} -> {target_w}x{target_h}")
                resample = getattr(Image, 'Resampling', Image).LANCZOS
                img_resized = img.resize((target_w, target_h), resample=resample)
            else:
                img_resized = img

            # Save as WebP with quality=80
            img_resized.save(dest_path, "WEBP", quality=80, method=6)

        after_size = os.path.getsize(dest_path)
        total_after += after_size
        saved_pct = (1.0 - (after_size / before_size)) * 100
        print(f"   -> Saved {dest_fname}: {after_size / (1024*1024):.2f} MB ({saved_pct:.1f}% reduction)\n")
        converted_files.append((src_path, dest_path))

    # Update data/scenes.json
    print(f"Updating {scenes_json_path}...")
    with open(scenes_json_path, "r", encoding="utf-8") as f:
        scenes_data = json.load(f)

    updated_scenes = 0
    for scene_key, scene_obj in scenes_data.items():
        pano_ref = scene_obj.get("panorama", "")
        if pano_ref.lower().endswith(".jpg") or pano_ref.lower().endswith(".jpeg"):
            base, _ = os.path.splitext(pano_ref)
            scene_obj["panorama"] = f"{base}.webp"
            updated_scenes += 1

    with open(scenes_json_path, "w", encoding="utf-8") as f:
        json.dump(scenes_data, f, indent=2)

    print(f"Updated {updated_scenes} scene panorama references to .webp in scenes.json.\n")

    # Remove old jpg files now that webp files are generated and verified
    print("Cleaning up old .jpg panoramas...")
    for src_path, dest_path in converted_files:
        if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
            os.remove(src_path)
    print("Old .jpg panoramas removed successfully.\n")

    mb_before = total_before / (1024 * 1024)
    mb_after = total_after / (1024 * 1024)
    mb_saved = mb_before - mb_after
    overall_reduction = (mb_saved / mb_before) * 100

    print("=" * 60)
    print("ASSET OPTIMIZATION REPORT:")
    print(f"Total Panoramas:       {len(converted_files)}")
    print(f"Original Total Size:   {mb_before:.2f} MB")
    print(f"Optimized Total Size:  {mb_after:.2f} MB")
    print(f"Bandwidth Saved:       {mb_saved:.2f} MB ({overall_reduction:.1f}% reduction)")
    print("=" * 60)

if __name__ == "__main__":
    optimize_panoramas()

