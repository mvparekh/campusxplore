import os
import json
import subprocess

project_root = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
pano_dir = os.path.join(project_root, "assets", "panoramas")
scenes_json_path = os.path.join(project_root, "data", "scenes.json")

with open(scenes_json_path, "r", encoding="utf-8") as f:
    scenes = json.load(f)

print(f"Standardizing {len(scenes)} panoramas to clean lowercase filenames...\n")

# Map of current relative path -> new lowercase relative path
rename_map = {}
for scene_key, scene_obj in sorted(scenes.items()):
    curr_pano = scene_obj.get("panorama", "")
    target_pano = f"assets/panoramas/{scene_key}.webp"
    rename_map[curr_pano] = target_pano

# Perform two-step git mv to avoid Windows case-insensitive filesystem collisions
for curr_pano, target_pano in rename_map.items():
    curr_file = os.path.basename(curr_pano)
    target_file = os.path.basename(target_pano)

    src_path = os.path.join(pano_dir, curr_file)
    tmp_path = os.path.join(pano_dir, f"tmp_{target_file}")
    final_path = os.path.join(pano_dir, target_file)

    if curr_file != target_file:
        print(f"Renaming: {curr_file} -> {target_file}")
        # Step 1: mv to temp
        subprocess.run(["git", "mv", "-f", os.path.join("assets", "panoramas", curr_file), os.path.join("assets", "panoramas", f"tmp_{target_file}")], cwd=project_root, check=True)
        # Step 2: mv temp to target
        subprocess.run(["git", "mv", "-f", os.path.join("assets", "panoramas", f"tmp_{target_file}"), os.path.join("assets", "panoramas", target_file)], cwd=project_root, check=True)

# Update scenes.json with standardized lowercase paths
for scene_key, scene_obj in scenes.items():
    scene_obj["panorama"] = f"assets/panoramas/{scene_key}.webp"

with open(scenes_json_path, "w", encoding="utf-8") as f:
    json.dump(scenes, f, indent=2)

print(f"\nUpdated {scenes_json_path} successfully.")
