/**
 * CampusXplore - 360 Panorama Viewer Controller (Pannellum.js Wrapper)
 * Supports smooth crossfades, yaw tracking, load lifecycle hooks,
 * and robust error boundary with automatic fallback to admin_gate.
 */

class PanoramaViewer {
    constructor() {
        this.viewer = null;
        this.scenes = {};
        this.currentSceneId = null;
        this.attemptedSceneId = null;
        this.isHandlingError = false;
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
        this.attemptedSceneId = initialSceneId;
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
                    sceneFadeDuration: 800, // Smooth 800ms crossfade between scenes
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
                this.attemptedSceneId = sceneId;
                if (this.onSceneLoadStart) {
                    this.onSceneLoadStart(sceneId);
                }
            });

            // Bind scene load completion listener
            this.viewer.on('load', () => {
                const activeSceneKey = this.viewer.getScene();
                this.currentSceneId = activeSceneKey;
                this.attemptedSceneId = activeSceneKey;
                if (this.onSceneLoadComplete) {
                    this.onSceneLoadComplete(activeSceneKey);
                }
                this.onSceneChange(activeSceneKey, this.scenes[activeSceneKey]);
            });

            // Robust Error Boundary: intercept image or WebGL errors
            this.viewer.on('error', (err) => {
                this.handleSceneError(err, this.attemptedSceneId || this.currentSceneId || 'admin_gate');
            });

            // Start smooth yaw/pitch tracking loop for radar cone sync
            this.startYawTracking();

        } catch (error) {
            console.error('Failed to initialize Pannellum viewer:', error);
            this.handleSceneError(error, initialSceneId);
        }
    }

    /**
     * Graceful error boundary: shows toast and automatically falls back to entrance
     */
    handleSceneError(err, failedSceneId) {
        console.error(`[Viewer Error Boundary] Failed to load scene "${failedSceneId}":`, err);

        // Prevent infinite error loop if fallback itself has issues
        if (this.isHandlingError) return;
        this.isHandlingError = true;

        this.showErrorToast("Scene image loading error — returning to entrance");

        if (this.onSceneLoadComplete) {
            this.onSceneLoadComplete(failedSceneId);
        }

        setTimeout(() => {
            if (failedSceneId !== 'admin_gate') {
                try {
                    this.loadScene('admin_gate');
                } catch (e) {
                    console.error('[Viewer Error Boundary] Fallback failed:', e);
                }
            }
            this.isHandlingError = false;
        }, 1500);
    }

    /**
     * Toast notification for error boundary feedback
     */
    showErrorToast(message = "Scene image loading error — returning to entrance") {
        let toast = document.getElementById('viewer-error-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'viewer-error-toast';
            toast.className = 'viewer-error-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
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
     * Switch to a target scene smoothly with error boundary protection
     * @param {string} sceneId 
     */
    loadScene(sceneId) {
        if (!this.viewer || !this.scenes[sceneId]) {
            console.warn(`Scene "${sceneId}" not found in scenes dictionary.`);
            this.handleSceneError(`Scene "${sceneId}" not found`, sceneId);
            return;
        }

        this.attemptedSceneId = sceneId;

        if (this.onSceneLoadStart) {
            this.onSceneLoadStart(sceneId);
        }

        try {
            this.viewer.loadScene(sceneId);
        } catch (error) {
            this.handleSceneError(error, sceneId);
        }
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
