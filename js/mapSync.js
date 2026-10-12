/**
 * CampusXplore - 2D Map ↔ 360 Panorama Bidirectional Synchronization Module
 */

class MapSync {
    constructor() {
        this.scenes = {};
        this.viewer = null;
        this.activeSceneId = null;
        this.activeFloor = 'all';
        this.activeCategory = 'all';

        // DOM elements
        this.mapBlock = null;
        this.mapWrapper = null;
        this.pinsLayer = null;
        this.mapPointer = null;
        this.radarCone = null;
        this.compassNeedle = null;
        this.pinElements = new Map();
    }

    /**
     * Initializes the MapSync controller
     * @param {Object} scenes Complete scene dataset
     * @param {PanoramaViewer} viewerInstance Instance of PanoramaViewer
     */
    init(scenes, viewerInstance) {
        this.scenes = scenes;
        this.viewer = viewerInstance;

        this.mapBlock = document.getElementById('map-block');
        this.mapWrapper = document.getElementById('map-wrapper');
        this.pinsLayer = document.getElementById('map-pins-layer');
        this.mapPointer = document.getElementById('map-pointer');
        this.radarCone = document.getElementById('radar-cone');
        this.compassNeedle = document.getElementById('compass-needle');

        this.renderScenePins();
        this.setupMapControls();
    }

    /**
     * Dynamically renders interactive pins for all scenes on the 2D map
     */
    renderScenePins() {
        if (!this.pinsLayer) return;
        this.pinsLayer.innerHTML = '';
        this.pinElements.clear();

        for (const [key, scene] of Object.entries(this.scenes)) {
            if (!scene.mapPos || scene.mapPos.t === undefined || scene.mapPos.l === undefined) continue;

            const pin = document.createElement('div');
            pin.className = `map-scene-pin ${scene.category || 'pathway'}`;
            pin.dataset.sceneId = key;
            pin.dataset.title = scene.title;
            pin.dataset.floor = scene.floor || 'Ground Floor';
            pin.dataset.category = scene.category || 'pathway';

            pin.style.top = `${scene.mapPos.t}%`;
            pin.style.left = `${scene.mapPos.l}%`;

            // Click on pin teleports 360 viewer to that scene
            pin.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.viewer) {
                    this.viewer.loadScene(key);
                }
            });

            this.pinsLayer.appendChild(pin);
            this.pinElements.set(key, pin);
        }
    }

    /**
     * Setup UI controls for floor toggling, minimizing, and region clicks
     */
    setupMapControls() {
        // Floor selector tabs
        const floorTabs = document.querySelectorAll('.floor-tab-btn');
        floorTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                floorTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.setFloorFilter(tab.dataset.floor);
            });
        });

        // Minimize / Expand Map toggle
        const toggleBtn = document.getElementById('map-toggle-minimize');
        const expandBtn = document.getElementById('map-expand-btn');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.mapBlock.classList.toggle('minimized');
            });
        }

        if (expandBtn) {
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.mapBlock.classList.remove('minimized');
            });
        }
    }

    /**
     * Updates active user marker and radar cone anchor to current scene coordinates
     * @param {string} sceneKey 
     * @param {Object} sceneData 
     */
    onSceneChanged(sceneKey, sceneData) {
        this.activeSceneId = sceneKey;

        if (this.mapPointer && sceneData && sceneData.mapPos) {
            this.mapPointer.style.display = 'block';
            this.mapPointer.style.top = `${sceneData.mapPos.t}%`;
            this.mapPointer.style.left = `${sceneData.mapPos.l}%`;
        }

        // Highlight active pin
        this.pinElements.forEach((pinEl, key) => {
            if (key === sceneKey) {
                pinEl.style.transform = 'translate(-50%, -50%) scale(1.6)';
                pinEl.style.borderColor = '#ef4444';
            } else {
                pinEl.style.transform = '';
                pinEl.style.borderColor = '#ffffff';
            }
        });
    }

    /**
     * Real-time yaw orientation synchronization for the radar cone and compass needle
     * @param {Object} orientation { yaw, pitch, hfov }
     */
    onOrientationUpdate(orientation) {
        const yaw = orientation.yaw || 0;

        // Rotate the radar cone on the 2D map to point in viewing direction
        if (this.radarCone) {
            this.radarCone.style.transform = `rotate(${yaw}deg)`;
        }

        // Rotate the compass needle
        if (this.compassNeedle) {
            this.compassNeedle.style.transform = `rotate(${-yaw}deg)`;
        }
    }

    /**
     * Filter scene pins by floor level ('all', 'Ground Floor', 'Floor 1')
     * @param {string} floor 
     */
    setFloorFilter(floor) {
        this.activeFloor = floor;
        this.applyFilters();
    }

    /**
     * Filter scene pins by category ('all', 'department', 'landmark', 'pathway')
     * @param {string} category 
     */
    setCategoryFilter(category) {
        this.activeCategory = category;
        this.applyFilters();
    }

    /**
     * Applies both floor and category filters to the pins
     */
    applyFilters() {
        this.pinElements.forEach((pinEl, key) => {
            const scene = this.scenes[key];
            const matchesFloor = (this.activeFloor === 'all') || (scene.floor === this.activeFloor);
            const matchesCategory = (this.activeCategory === 'all') || (scene.category === this.activeCategory);

            if (matchesFloor && matchesCategory) {
                pinEl.classList.remove('dimmed');
                pinEl.style.display = 'block';
            } else {
                pinEl.classList.add('dimmed');
            }
        });
    }
}

// Export for module or global use
window.MapSync = MapSync;

