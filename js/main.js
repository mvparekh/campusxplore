/**
 * CampusXplore - Main Orchestrator & UI Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
    let scenesData = {};
    let viewer = null;
    let mapSync = null;
    let audioNarrationEnabled = false;

    // DOM Elements
    const locationChipText = document.getElementById('current-location-name');
    const floorBadgeText = document.getElementById('current-floor-badge');
    const searchInput = document.getElementById('scene-search-input');
    const dropdownList = document.getElementById('scene-dropdown-list');
    const filterChips = document.querySelectorAll('.filter-chip');
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    const resetTourBtn = document.getElementById('reset-tour-btn');
    const compassWidget = document.getElementById('compass-widget');
    const infoModal = document.getElementById('info-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // 1. Fetch Scenes Data
    try {
        const response = await fetch('data/scenes.json');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        scenesData = await response.json();
    } catch (err) {
        console.error('Failed to load scenes.json, falling back to local fallback:', err);
        alert('Notice: Could not load data/scenes.json. Ensure the application is served over HTTP/HTTPS.');
        return;
    }

    // 2. Initialize Panorama Viewer
    viewer = new PanoramaViewer();
    mapSync = new MapSync();

    viewer.init('panorama', scenesData, 'admin_gate', {
        onSceneChange: (sceneKey, scene) => {
            // Update Header Chip
            if (locationChipText && scene) {
                locationChipText.textContent = scene.title || 'Campus Location';
            }
            if (floorBadgeText && scene) {
                floorBadgeText.textContent = scene.floor || 'Ground Floor';
            }

            // Sync 2D Map Marker & Active Scene
            mapSync.onSceneChanged(sceneKey, scene);

            // Update Quick Jump Active Item
            updateDropdownActive(sceneKey);

            // Optional Voiceover (only if user explicitly enabled it)
            if (audioNarrationEnabled && 'speechSynthesis' in window && scene) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(`Now exploring ${scene.title}`);
                utterance.rate = 1.0;
                window.speechSynthesis.speak(utterance);
            }
        },

        onYawChange: (orientation) => {
            // Sync Radar Cone & Compass
            mapSync.onOrientationUpdate(orientation);
        },

        onInfoClick: (infoData) => {
            showInfoModal(infoData.title, infoData.desc);
        }
    });

    // 3. Initialize Map Sync
    mapSync.init(scenesData, viewer);

    // 4. Setup Quick Jump Search & Dropdown List
    populateDropdownList(scenesData);

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            filterDropdownItems(query);
        });
    }

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const category = chip.dataset.category;
            mapSync.setCategoryFilter(category);
            filterDropdownByCategory(category);
        });
    });

    // 5. Setup Action Buttons
    if (resetTourBtn) {
        resetTourBtn.addEventListener('click', () => {
            viewer.loadScene('admin_gate');
        });
    }

    if (compassWidget) {
        compassWidget.addEventListener('click', () => {
            viewer.resetOrientation();
        });
    }

    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', () => {
            audioNarrationEnabled = !audioNarrationEnabled;
            const iconImg = audioToggleBtn.querySelector('img');
            if (iconImg) {
                iconImg.src = audioNarrationEnabled ? 'assets/icons/sound-on.svg' : 'assets/icons/sound-off.svg';
            }
            audioToggleBtn.title = audioNarrationEnabled ? 'Mute Voice Narration' : 'Enable Voice Narration';
            audioToggleBtn.style.color = audioNarrationEnabled ? '#10b981' : '#f8fafc';

            if (audioNarrationEnabled && 'speechSynthesis' in window) {
                const testUtterance = new SpeechSynthesisUtterance('Audio narration enabled');
                window.speechSynthesis.speak(testUtterance);
            } else if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        });
    }

    // 6. Info Modal Controls
    function showInfoModal(title, description) {
        if (!infoModal) return;
        modalTitle.textContent = title;
        modalBody.innerHTML = `<p>${description}</p>`;
        infoModal.classList.add('active');

        if (audioNarrationEnabled && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(`${title}. ${description}`);
            window.speechSynthesis.speak(utterance);
        }
    }

    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', () => {
            infoModal.classList.remove('active');
        });
    }

    // Close modal on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && infoModal.classList.contains('active')) {
            infoModal.classList.remove('active');
        }
    });

    // Helper Functions
    function populateDropdownList(scenes) {
        if (!dropdownList) return;
        dropdownList.innerHTML = '';

        for (const [key, scene] of Object.entries(scenes)) {
            const btn = document.createElement('button');
            btn.className = 'scene-item-btn';
            btn.dataset.sceneKey = key;
            btn.dataset.category = scene.category || 'pathway';
            btn.dataset.title = scene.title.toLowerCase();

            btn.innerHTML = `
                <span>${scene.title}</span>
                <span style="font-size: 0.7rem; opacity: 0.7;">${scene.floor || ''}</span>
            `;

            btn.addEventListener('click', () => {
                viewer.loadScene(key);
            });

            dropdownList.appendChild(btn);
        }
    }

    function updateDropdownActive(sceneKey) {
        const items = document.querySelectorAll('.scene-item-btn');
        items.forEach(btn => {
            if (btn.dataset.sceneKey === sceneKey) {
                btn.classList.add('active');
                btn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                btn.classList.remove('active');
            }
        });
    }

    function filterDropdownItems(query) {
        const items = document.querySelectorAll('.scene-item-btn');
        items.forEach(btn => {
            const title = btn.dataset.title || '';
            btn.style.display = title.includes(query) ? 'flex' : 'none';
        });
    }

    function filterDropdownByCategory(category) {
        const items = document.querySelectorAll('.scene-item-btn');
        items.forEach(btn => {
            if (category === 'all' || btn.dataset.category === category) {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        });
    }
});
