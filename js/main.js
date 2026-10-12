/**
 * CampusXplore - Main Application Orchestrator
 * Integrates 360 Viewer, 2D Map Sync, Radar Cone, and Firebase Auth / Firestore DB.
 */

import { authManager } from "./auth.js";

document.addEventListener('DOMContentLoaded', async () => {
    let scenesData = {};
    let viewer = null;
    let mapSync = null;
    let audioNarrationEnabled = false;
    let currentActiveSceneKey = 'admin_gate';

    // UI Elements - Header & Navigation
    const locationChipText = document.getElementById('current-location-name');
    const floorBadgeText = document.getElementById('current-floor-badge');
    const searchInput = document.getElementById('scene-search-input');
    const dropdownList = document.getElementById('scene-dropdown-list');
    const filterChips = document.querySelectorAll('.filter-chip');
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    const resetTourBtn = document.getElementById('reset-tour-btn');
    const compassWidget = document.getElementById('compass-widget');

    // UI Elements - Auth & Profile
    const authOpenBtn = document.getElementById('auth-open-btn');
    const authSignoutBtn = document.getElementById('auth-signout-btn');
    const userProfilePill = document.getElementById('user-profile-pill');
    const userAvatarLetter = document.getElementById('user-avatar-letter');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleText = document.getElementById('user-role-text');
    const bookmarksDrawerBtn = document.getElementById('bookmarks-drawer-btn');

    // UI Elements - Auth Modal
    const authModalBackdrop = document.getElementById('auth-modal-backdrop');
    const authCloseBtn = document.getElementById('auth-close-btn');
    const tabSignIn = document.getElementById('tab-sign-in');
    const tabSignUp = document.getElementById('tab-sign-up');
    const formSignIn = document.getElementById('form-sign-in');
    const formSignUp = document.getElementById('form-sign-up');
    const authErrorBanner = document.getElementById('auth-error-banner');
    const btnGoogleAuth = document.getElementById('btn-google-auth');

    // UI Elements - Bookmarks Drawer
    const bookmarksDrawer = document.getElementById('bookmarks-drawer');
    const bookmarksCloseBtn = document.getElementById('bookmarks-close-btn');
    const bookmarksListContainer = document.getElementById('bookmarks-list-container');
    const sceneBookmarkBtn = document.getElementById('scene-bookmark-btn');

    // UI Elements - Reviews Modal
    const sceneReviewBtn = document.getElementById('scene-review-btn');
    const reviewsModalBackdrop = document.getElementById('reviews-modal-backdrop');
    const reviewsCloseBtn = document.getElementById('reviews-close-btn');
    const reviewSceneTitle = document.getElementById('review-scene-title');
    const formSubmitReview = document.getElementById('form-submit-review');
    const reviewCommentInput = document.getElementById('review-comment-input');
    const reviewsListContainer = document.getElementById('reviews-list-container');
    const starSpans = document.querySelectorAll('#star-rating-selector span');
    let selectedStarRating = 5;

    // UI Elements - Info Flashcard
    const infoModal = document.getElementById('info-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');

    // ========================================================================
    // 1. Fetch Campus Scenes Dataset
    // ========================================================================
    try {
        const response = await fetch('data/scenes.json');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        scenesData = await response.json();
    } catch (err) {
        console.error('Failed to load scenes.json:', err);
        alert('Notice: Could not load data/scenes.json. Make sure the site is served over an HTTP/HTTPS server.');
        return;
    }

    // ========================================================================
    // 2. Initialize 360 Viewer & 2D Map Sync
    // ========================================================================
    viewer = new window.PanoramaViewer();
    mapSync = new window.MapSync();

    viewer.init('panorama', scenesData, 'admin_gate', {
        onSceneChange: (sceneKey, scene) => {
            currentActiveSceneKey = sceneKey;

            // Update Header Chip & Floor
            if (locationChipText && scene) {
                locationChipText.textContent = scene.title || 'Campus Location';
            }
            if (floorBadgeText && scene) {
                floorBadgeText.textContent = scene.floor || 'Ground Floor';
            }

            // Sync 2D Map Marker & Active Radar Anchor
            mapSync.onSceneChanged(sceneKey, scene);

            // Update Quick Jump Active Item in Search
            updateDropdownActive(sceneKey);

            // Update Bookmark Button Status for Active Scene
            updateBookmarkButtonState(sceneKey);

            // Telemetry: Log Scene Visit
            authManager.logVisit(sceneKey);

            // Optional Voiceover (only if user explicitly activated sound)
            if (audioNarrationEnabled && 'speechSynthesis' in window && scene) {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(`Now exploring ${scene.title}`);
                utterance.rate = 1.0;
                window.speechSynthesis.speak(utterance);
            }
        },

        onYawChange: (orientation) => {
            // Real-Time Radar Cone Rotation & Compass Sync
            mapSync.onOrientationUpdate(orientation);
        },

        onInfoClick: (infoData) => {
            showInfoModal(infoData.title, infoData.desc);
        }
    });

    // Initialize 2D Map Sync Pins
    mapSync.init(scenesData, viewer);

    // Populate Search / Quick Jump List
    populateDropdownList(scenesData);

    // ========================================================================
    // 3. Auth State Observer & UI Synchronization
    // ========================================================================
    authManager.initAuth((user) => {
        if (user) {
            // Authenticated State
            authOpenBtn.style.display = 'none';
            userProfilePill.style.display = 'flex';
            authSignoutBtn.style.display = 'flex';
            bookmarksDrawerBtn.style.display = 'flex';

            const name = user.displayName || user.email.split('@')[0];
            userDisplayName.textContent = name;
            userRoleText.textContent = user.role || 'student';
            userAvatarLetter.textContent = name.charAt(0).toUpperCase();

            // Refresh Bookmarks
            updateBookmarkButtonState(currentActiveSceneKey);
            loadBookmarksDrawer();
        } else {
            // Unauthenticated State
            authOpenBtn.style.display = 'flex';
            userProfilePill.style.display = 'none';
            authSignoutBtn.style.display = 'none';
            bookmarksDrawerBtn.style.display = 'none';
            bookmarksDrawer.classList.remove('active');

            updateBookmarkButtonState(currentActiveSceneKey);
        }
    });

    // ========================================================================
    // 4. In-Tour Bookmarking & Reviews
    // ========================================================================
    async function updateBookmarkButtonState(sceneKey) {
        if (!sceneBookmarkBtn) return;
        const isSaved = await authManager.isSceneBookmarked(sceneKey);
        const icon = sceneBookmarkBtn.querySelector('img');

        if (isSaved) {
            sceneBookmarkBtn.classList.add('active');
            if (icon) icon.src = 'assets/icons/bookmark-filled.svg';
            sceneBookmarkBtn.title = 'Saved to Bookmarks (Click to remove)';
        } else {
            sceneBookmarkBtn.classList.remove('active');
            if (icon) icon.src = 'assets/icons/bookmark.svg';
            sceneBookmarkBtn.title = 'Bookmark this location';
        }
    }

    if (sceneBookmarkBtn) {
        sceneBookmarkBtn.addEventListener('click', async () => {
            if (!authManager.isAuthenticated()) {
                showAuthModal("Please sign in to save campus bookmarks.");
                return;
            }

            const currentScene = scenesData[currentActiveSceneKey];
            const title = currentScene ? currentScene.title : currentActiveSceneKey;

            const res = await authManager.toggleBookmark(currentActiveSceneKey, title);
            if (res.success) {
                updateBookmarkButtonState(currentActiveSceneKey);
                loadBookmarksDrawer();
            } else if (res.requireAuth) {
                showAuthModal(res.error);
            }
        });
    }

    // Bookmarks Drawer
    async function loadBookmarksDrawer() {
        if (!bookmarksListContainer) return;
        const user = authManager.getCurrentUser();
        if (!user) return;

        const bookmarks = await authManager.getUserBookmarks(user.uid);
        bookmarksListContainer.innerHTML = '';

        if (!bookmarks || bookmarks.length === 0) {
            bookmarksListContainer.innerHTML = `
                <div class="bookmarks-empty-state">
                    <span style="font-size: 2.2rem; display: block; margin-bottom: 8px;">📍</span>
                    <p>No saved locations yet.</p>
                    <span style="font-size: 0.78rem; opacity: 0.7;">Click the bookmark icon during your tour to save favorite spots.</span>
                </div>
            `;
            return;
        }

        bookmarks.forEach(bm => {
            const card = document.createElement('div');
            card.className = 'bookmark-card';
            card.innerHTML = `
                <div>
                    <div class="bookmark-title">${bm.sceneTitle}</div>
                    <span style="font-size: 0.7rem; color: #94a3b8;">${scenesData[bm.sceneId]?.floor || 'Campus'}</span>
                </div>
                <button class="bookmark-delete-btn" title="Remove bookmark">×</button>
            `;

            // Click to load scene
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('bookmark-delete-btn')) return;
                viewer.loadScene(bm.sceneId);
                bookmarksDrawer.classList.remove('active');
            });

            // Remove button
            const delBtn = card.querySelector('.bookmark-delete-btn');
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await authManager.toggleBookmark(bm.sceneId, bm.sceneTitle);
                loadBookmarksDrawer();
                updateBookmarkButtonState(currentActiveSceneKey);
            });

            bookmarksListContainer.appendChild(card);
        });
    }

    if (bookmarksDrawerBtn) {
        bookmarksDrawerBtn.addEventListener('click', () => {
            bookmarksDrawer.classList.toggle('active');
            loadBookmarksDrawer();
        });
    }

    if (bookmarksCloseBtn) {
        bookmarksCloseBtn.addEventListener('click', () => {
            bookmarksDrawer.classList.remove('active');
        });
    }

    // Reviews Modal
    if (sceneReviewBtn) {
        sceneReviewBtn.addEventListener('click', async () => {
            const currentScene = scenesData[currentActiveSceneKey];
            reviewSceneTitle.textContent = currentScene ? currentScene.title : "Campus Location";
            reviewsModalBackdrop.classList.add('active');
            loadSceneReviews(currentActiveSceneKey);
        });
    }

    if (reviewsCloseBtn) {
        reviewsCloseBtn.addEventListener('click', () => {
            reviewsModalBackdrop.classList.remove('active');
        });
    }

    starSpans.forEach(span => {
        span.addEventListener('click', () => {
            selectedStarRating = parseInt(span.dataset.value);
            starSpans.forEach(s => {
                s.classList.toggle('selected', parseInt(s.dataset.value) <= selectedStarRating);
            });
        });
    });

    if (formSubmitReview) {
        formSubmitReview.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!authManager.isAuthenticated()) {
                reviewsModalBackdrop.classList.remove('active');
                showAuthModal("Please sign in to submit a location note.");
                return;
            }

            const comment = reviewCommentInput.value.trim();
            const submitBtn = document.getElementById('btn-submit-review');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Submitting...';

            const res = await authManager.submitReview(currentActiveSceneKey, selectedStarRating, comment);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Note';

            if (res.success) {
                reviewCommentInput.value = '';
                loadSceneReviews(currentActiveSceneKey);
            } else {
                alert(res.error || "Failed to submit review.");
            }
        });
    }

    async function loadSceneReviews(sceneId) {
        if (!reviewsListContainer) return;
        reviewsListContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.8rem;">Loading notes...</p>';

        const reviews = await authManager.getSceneReviews(sceneId);
        reviewsListContainer.innerHTML = '';

        if (!reviews || reviews.length === 0) {
            reviewsListContainer.innerHTML = '<p style="color: #64748b; font-size: 0.8rem; font-style: italic;">No reviews yet. Be the first to leave a tip!</p>';
            return;
        }

        reviews.forEach(r => {
            const card = document.createElement('div');
            card.className = 'review-card';
            const stars = '★'.repeat(r.rating || 5);
            card.innerHTML = `
                <div class="review-meta">
                    <span>${r.userEmail ? r.userEmail.split('@')[0] : 'Visitor'}</span>
                    <span class="review-stars">${stars}</span>
                </div>
                <div class="review-comment">${r.comment}</div>
            `;
            reviewsListContainer.appendChild(card);
        });
    }

    // ========================================================================
    // 5. Auth Modal Event Handlers
    // ========================================================================
    function showAuthModal(message = "") {
        if (message) {
            authErrorBanner.textContent = message;
            authErrorBanner.classList.add('show');
        } else {
            authErrorBanner.classList.remove('show');
        }
        authModalBackdrop.classList.add('active');
    }

    if (authOpenBtn) {
        authOpenBtn.addEventListener('click', () => showAuthModal());
    }

    if (authCloseBtn) {
        authCloseBtn.addEventListener('click', () => {
            authModalBackdrop.classList.remove('active');
        });
    }

    if (authSignoutBtn) {
        authSignoutBtn.addEventListener('click', async () => {
            await authManager.signOutUser();
        });
    }

    // Tab Switching
    tabSignIn.addEventListener('click', () => {
        tabSignIn.classList.add('active');
        tabSignUp.classList.remove('active');
        formSignIn.style.display = 'block';
        formSignUp.style.display = 'none';
        authErrorBanner.classList.remove('show');
    });

    tabSignUp.addEventListener('click', () => {
        tabSignUp.classList.add('active');
        tabSignIn.classList.remove('active');
        formSignUp.style.display = 'block';
        formSignIn.style.display = 'none';
        authErrorBanner.classList.remove('show');
    });

    // Sign In Submit
    formSignIn.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;
        const submitBtn = document.getElementById('btn-submit-signin');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Signing In...</span>';
        authErrorBanner.classList.remove('show');

        const result = await authManager.signInWithEmail(email, password);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Sign In</span>';

        if (result.success) {
            authModalBackdrop.classList.remove('active');
            formSignIn.reset();
        } else {
            authErrorBanner.textContent = result.error;
            authErrorBanner.classList.add('show');
        }
    });

    // Sign Up Submit
    formSignUp.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;
        const role = document.getElementById('signup-role').value;
        const submitBtn = document.getElementById('btn-submit-signup');

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Creating Account...</span>';
        authErrorBanner.classList.remove('show');

        const result = await authManager.signUpWithEmail(email, password, name, role);
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>Create Account</span>';

        if (result.success) {
            authModalBackdrop.classList.remove('active');
            formSignUp.reset();
        } else {
            authErrorBanner.textContent = result.error;
            authErrorBanner.classList.add('show');
        }
    });

    // Google Sign In
    if (btnGoogleAuth) {
        btnGoogleAuth.addEventListener('click', async () => {
            const res = await authManager.signInWithGoogle();
            if (res.success) {
                authModalBackdrop.classList.remove('active');
            } else {
                authErrorBanner.textContent = res.error;
                authErrorBanner.classList.add('show');
            }
        });
    }

    // ========================================================================
    // 6. Navigation, Quick Jump, & Search Controls
    // ========================================================================
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

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll('.scene-item-btn');
            items.forEach(btn => {
                const title = btn.dataset.title || '';
                btn.style.display = title.includes(query) ? 'flex' : 'none';
            });
        });
    }

    filterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            filterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const category = chip.dataset.category;
            mapSync.setCategoryFilter(category);

            const items = document.querySelectorAll('.scene-item-btn');
            items.forEach(btn => {
                if (category === 'all' || btn.dataset.category === category) {
                    btn.style.display = 'flex';
                } else {
                    btn.style.display = 'none';
                }
            });
        });
    });

    // Reset Tour
    if (resetTourBtn) {
        resetTourBtn.addEventListener('click', () => {
            viewer.loadScene('admin_gate');
        });
    }

    // Compass Alignment
    if (compassWidget) {
        compassWidget.addEventListener('click', () => {
            viewer.resetOrientation();
        });
    }

    // Audio Voiceover Toggle
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

    // Info Flashcard Modal
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

    // Global Keybindings (ESC to close modals)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (infoModal) infoModal.classList.remove('active');
            if (authModalBackdrop) authModalBackdrop.classList.remove('active');
            if (bookmarksDrawer) bookmarksDrawer.classList.remove('active');
            if (reviewsModalBackdrop) reviewsModalBackdrop.classList.remove('active');
        }
    });
});
