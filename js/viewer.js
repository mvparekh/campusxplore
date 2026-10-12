/**
 * CampusXplore - 360 Panorama Viewer Controller (Pannellum.js Wrapper)
 * Supports smooth crossfades, yaw tracking, and load lifecycle hooks.
 */

class PanoramaViewer {
    constructor() {
        this.viewer = null;
        this.scenes = {};
        this.currentSceneId = null;
        this.onSceneChange = null;
        this.onSceneLoadStart = null;
        this.onSceneLoadComplete = null;
        this.onYawChange = null;
        this.onInfoClick = null;
        this.animationFrameId = null;
        this.lastReportedYaw = null;
    }

    /**
     * Initializes the Pannellum viewer
     * @param {string} containerId DOM ID of viewer container
     * @param {Object} scenesData Complete scenes configuration object
     * @param {string} initialSceneId Starting scene key
     * @param {Object} callbacks Event callbacks { onSceneChange, onSceneLoadStart, onSceneLoadComplete, onYawChange, onInfoClick }
     */
    init(containerId, scenesData, initialSceneId = 'admin_gate', callbacks = {}) {
        this.scenes = scenesData;
        this.currentSceneId = initialSceneId;
        this.onSceneChange = callbacks.onSceneChange || (() => {});
        this.onSceneLoadStart = callbacks.onSceneLoadStart || (() => {});
        this.onSceneLoadComplete = callbacks.onSceneLoadComplete || (() => {});
        this.onYawChange = callbacks.onYawChange || (() => {});
        this.onInfoClick = callbacks.onInfoClick || (() => {});

        // Build pannellum compatible scene definitions with custom tooltip functions
        const pannellumScenes = {};
        for (const [key, scene] of Object.entries(this.scenes)) {
            const pScene = {
                title: scene.title,
                type: scene.type || 'equirectangular',
                panorama: scene.panorama,
                hotSpots: []
            };

            if (Array.isArray(scene.hotSpots)) {
                pScene.hotSpots = scene.hotSpots.map(hs => {
                    if (hs.type === 'scene') {
                        return {
                            pitch: hs.pitch,
                            yaw: hs.yaw,
                            type: 'scene',
                            text: hs.text,
                            sceneId: hs.sceneId,
                            cssClass: 'scene-hotspot'
                        };
                    } else {
                        // Info hotspot with custom click and tooltip
                        return {
                            pitch: hs.pitch,
                            yaw: hs.yaw,
                            cssClass: 'info-hotspot',
                            createTooltipFunc: (hotSpotDiv, args) => this.createCustomTooltip(hotSpotDiv, hs),
                            createTooltipArgs: hs
                        };
                    }
                });
            }

            pannellumScenes[key] = pScene;
        }

        try {
            this.viewer = pannellum.viewer(containerId, {
                default: {
                    firstScene: initialSceneId,
                    sceneFadeDuration: 1000, // Smooth crossfade between panoramas
                    autoLoad: true,
                    showControls: true,
                    compass: false,
                    mouseZoom: true,
                    hfov: 100,
                    minHfov: 50,
                    maxHfov: 120,
                    orientationOnDeviceHelp: false
                },
                scenes: pannellumScenes
            });

            // Bind scene change start listener
            this.viewer.on('scenechange', (sceneId) => {
                if (this.onSceneLoadStart) {
                    this.onSceneLoadStart(sceneId);
                }
            });

            // Bind scene load completion listener
            this.viewer.on('load', () => {
                const activeSceneKey = this.viewer.getScene();
                this.currentSceneId = activeSceneKey;
                if (this.onSceneLoadComplete) {
                    this.onSceneLoadComplete(activeSceneKey);
                }
                this.onSceneChange(activeSceneKey, this.scenes[activeSceneKey]);
            });

            // Start smooth yaw/pitch tracking loop for radar cone sync
            this.startYawTracking();

        } catch (error) {
            console.error('Failed to initialize Pannellum viewer:', error);
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#fff;background:#0f172a;text-align:center;padding:20px;">
                        <div>
                            <h2>WebGL Viewer Initialization Error</h2>
                            <p style="color:#94a3b8;margin-top:10px;">Your browser or device may not support WebGL, or an asset failed to load.</p>
                        </div>
                    </div>
                `;
            }
        }
    }

    /**
     * Custom DOM creation for info hotspots
     */
    createCustomTooltip(hotSpotDiv, hsData) {
        hotSpotDiv.classList.add('info-hotspot');
        
        // Add animated pulse ring
        const ring = document.createElement('div');
        ring.className = 'info-pulse-ring';
        hotSpotDiv.appendChild(ring);

        // Click handler to open detail modal
        hotSpotDiv.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onInfoClick({
                title: hsData.infoTitle || hsData.text || 'Information',
                desc: hsData.infoDesc || 'Campus location information.'
            });
        });
    }

    /**
     * Real-time animation loop tracking viewer yaw for the radar cone
     */
    startYawTracking() {
        const checkYaw = () => {
            if (this.viewer) {
                try {
                    const currentYaw = this.viewer.getYaw();
                    const currentPitch = this.viewer.getPitch();
                    const currentHfov = this.viewer.getHfov();

                    if (currentYaw !== undefined && currentYaw !== this.lastReportedYaw) {
                        this.lastReportedYaw = currentYaw;
                        this.onYawChange({
                            yaw: currentYaw,
                            pitch: currentPitch,
                            hfov: currentHfov
                        });
                    }
                } catch (e) {
                    // Ignore errors during scene transition
                }
            }
            this.animationFrameId = requestAnimationFrame(checkYaw);
        };
        this.animationFrameId = requestAnimationFrame(checkYaw);
    }

    /**
     * Switch to a target scene smoothly
     * @param {string} sceneId 
     */
    loadScene(sceneId) {
        if (!this.viewer || !this.scenes[sceneId]) {
            console.warn(`Scene "${sceneId}" not found in scenes dictionary.`);
            return;
        }
        if (this.onSceneLoadStart) {
            this.onSceneLoadStart(sceneId);
        }
        this.viewer.loadScene(sceneId);
    }

    /**
     * Reset view yaw to 0
     */
    resetOrientation() {
        if (this.viewer) {
            this.viewer.setYaw(0);
            this.viewer.setPitch(0);
        }
    }

    getCurrentSceneId() {
        return this.currentSceneId;
    }

    getYaw() {
        return this.viewer ? this.viewer.getYaw() : 0;
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.viewer) {
            this.viewer.destroy();
            this.viewer = null;
        }
    }
}

// Export for module or global use
window.PanoramaViewer = PanoramaViewer;
