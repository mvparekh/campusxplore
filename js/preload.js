/**
 * CampusXplore - Intelligent Graph Preloader
 * Pre-fetches adjacent 360 panorama nodes into browser cache
 * based on current scene hotspot topology.
 */

// Track already loaded or in-flight panoramas to prevent duplicate network requests
const preloadedUrls = new Set();

/**
 * Inspects adjacent hotspot nodes of currentSceneId and preloads their panorama images.
 * @param {string} currentSceneId Current active scene identifier
 * @param {Object} scenesData Complete scenes configuration object
 */
export function preloadAdjacentScenes(currentSceneId, scenesData) {
    if (!currentSceneId || !scenesData || !scenesData[currentSceneId]) {
        return;
    }

    const currentScene = scenesData[currentSceneId];
    if (!Array.isArray(currentScene.hotSpots)) {
        return;
    }

    // Extract all scene transition targets
    const targetSceneIds = currentScene.hotSpots
        .filter(hs => hs.type === 'scene' && hs.sceneId && scenesData[hs.sceneId])
        .map(hs => hs.sceneId);

    if (targetSceneIds.length === 0) return;

    // Silently pre-fetch adjacent panoramas
    targetSceneIds.forEach(targetId => {
        const targetScene = scenesData[targetId];
        const panoUrl = targetScene ? targetScene.panorama : null;

        if (panoUrl && !preloadedUrls.has(panoUrl)) {
            preloadedUrls.add(panoUrl);

            const img = new Image();
            img.decoding = 'async';
            img.src = panoUrl;

            img.onload = () => {
                // Panorama is successfully cached in browser memory & disk cache
            };

            img.onerror = () => {
                // Allow retry if network dropped momentarily
                preloadedUrls.delete(panoUrl);
                console.warn(`[Preloader] Could not prefetch adjacent scene: ${panoUrl}`);
            };
        }
    });
}

export default { preloadAdjacentScenes };
