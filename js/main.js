/**
 * CampusXplore - Main Application Orchestrator
 * Strictly Gated Virtual Tour & 2D Map with SCET Domain Validation
 */

import { authManager } from "./auth.js";
import { preloadAdjacentScenes } from "./preload.js";

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

    // UI Elements - Auth & Header Badges
    const authSignoutBtn = document.getElementById('auth-signout-btn');
    const userProfilePill = document.getElementById('user-profile-pill');
    const userAvatarLetter = document.getElementById('user-avatar-letter');
    const userDisplayName = document.getElementById('user-display-name');
    const userRoleText = document.getElementById('user-role-text');
    const bookmarksDrawerBtn = document.getElementById('bookmarks-drawer-btn');

    // UI Elements - Mandatory Login Gateway Portal
    const loginGateScreen = document.getElementById('login-gate-screen') || document.getElementById('gated-auth-overlay');
    const tourAppContainer = document.getElementById('tour-app-container');
    const typeScetBtn = document.getElementById('type-scet-btn');
    const typeVisitorBtn = document.getElementById('type-visitor-btn');
    const domainNoticeBadge = document.getElementById('domain-notice-badge');
    const domainNoticeText = document.getElementById('domain-notice-text');
    const signinDomainBadge = document.getElementById('signin-domain-badge');
    const signupDomainBadge = document.getElementById('signup-domain-badge');
    const googleAuthBtnText = document.getElementById('google-auth-btn-text');
    const signupRoleGroup = document.getElementById('signup-role-group');
    const signinEmail = document.getElementById('signin-email');
    const signupEmail = document.getElementById('signup-email');
    const authErrorBanner = document.getElementById('auth-error-banner');
    const tabSignIn = document.getElementById('tab-sign-in');
    const tabSignUp = document.getElementById('tab-sign-up');
    const formSignIn = document.getElementById('form-sign-in');
    const formSignUp = document.getElementById('form-sign-up');
    const btnGoogleAuth = document.getElementById('btn-google-auth');

    // User Type State & Domain Regex
    let selectedUserType = 'campus'; // 'campus' | 'visitor'
    const scetRegex = /^[a-zA-Z0-9._%+-]+@scet\.ac\.in$/i;

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

    // UI Elements - Glassmorphic Scene Loading Spinner Badge
    const sceneLoadingBadge = document.getElementById('scene-loading-badge');
    let sceneLoadingTimer = null;

    function handleSceneLoadStart() {
        if (sceneLoadingTimer) clearTimeout(sceneLoadingTimer);
        // Industry-standard UX: only show spinner if uncached texture takes >250ms
        sceneLoadingTimer = setTimeout(() => {
            if (sceneLoadingBadge) sceneLoadingBadge.classList.add('visible');
        }, 250);
    }

    function handleSceneLoadComplete() {
        if (sceneLoadingTimer) {
            clearTimeout(sceneLoadingTimer);
            sceneLoadingTimer = null;
        }
        if (sceneLoadingBadge) sceneLoadingBadge.classList.remove('visible');
    }

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
    // 2. Lazy Tour Initialization & Teardown Controller
    // ========================================================================
    function initTour(startingScene = 'admin_gate') {
        if (!viewer) {
            viewer = new window.PanoramaViewer();
            mapSync = new window.MapSync();

            viewer.init('panorama', scenesData, startingScene, {
                onSceneLoadStart: handleSceneLoadStart,
                onSceneLoadComplete: handleSceneLoadComplete,
                onSceneChange: (sceneKey, scene) => {
                    handleSceneLoadComplete();
                    currentActiveSceneKey = sceneKey;

                    // Intelligent Graph Preloader: silently cache connected adjacent panoramas
                    preloadAdjacentScenes(sceneKey, scenesData);

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

                    // Optional Voiceover
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

            // Immediately preload adjacent nodes for starting scene
            preloadAdjacentScenes(startingScene, scenesData);
        } else {
            handleSceneLoadStart();
            viewer.loadScene(startingScene);
        }
    }

    function teardownTour() {
        handleSceneLoadComplete();
        if (viewer) {
            try {
                viewer.destroy();
            } catch (e) {
                console.warn('[CampusXplore] Error tearing down viewer:', e);
            }
            viewer = null;
        }
        mapSync = null;

        // Purge Pannellum DOM to ensure WebGL context and assets are freed
        const panEl = document.getElementById('panorama');
        if (panEl) panEl.innerHTML = '';
    }

    // ========================================================================
    // 3. Auth State Observer & Strict Access Gateway
    // ========================================================================
    authManager.initAuth((user) => {
        if (user) {
            // Reveal Tour UI & Hide Login Gateway
            if (loginGateScreen) {
                loginGateScreen.classList.add('unlocked');
            }
            if (tourAppContainer) {
                tourAppContainer.style.display = 'block';
                tourAppContainer.classList.add('unlocked');
            }

            // Configure Header User Info and Badge
            if (userProfilePill) userProfilePill.style.display = 'flex';
            if (authSignoutBtn) authSignoutBtn.style.display = 'flex';
            if (bookmarksDrawerBtn) bookmarksDrawerBtn.style.display = 'flex';

            const name = user.displayName || user.email.split('@')[0];
            if (userDisplayName) userDisplayName.textContent = name;
            if (userAvatarLetter) userAvatarLetter.textContent = name.charAt(0).toUpperCase();

            if (userRoleText) {
                if (user.userType === 'campus') {
                    userRoleText.textContent = '[🎓 SCET Member]';
                    userRoleText.className = 'user-role-badge badge-campus';
                } else {
                    userRoleText.textContent = '[🌐 Visitor]';
                    userRoleText.className = 'user-role-badge badge-visitor';
                }
            }

            // Initialize Pannellum & Minimap only NOW!
            initTour(currentActiveSceneKey || 'admin_gate');

            // Refresh Bookmarks for active scene
            updateBookmarkButtonState(currentActiveSceneKey);
            loadBookmarksDrawer();
        } else {
            // Teardown Tour instance & purge WebGL
            teardownTour();

            // Hide Tour UI completely
            if (tourAppContainer) {
                tourAppContainer.classList.remove('unlocked');
                tourAppContainer.style.display = 'none';
            }
            if (userProfilePill) userProfilePill.style.display = 'none';
            if (authSignoutBtn) authSignoutBtn.style.display = 'none';
            if (bookmarksDrawerBtn) bookmarksDrawerBtn.style.display = 'none';
            if (bookmarksDrawer) bookmarksDrawer.classList.remove('active');
            if (reviewsModalBackdrop) reviewsModalBackdrop.classList.remove('active');

            // Re-display full-screen Login Gateway
            if (loginGateScreen) {
                loginGateScreen.classList.remove('unlocked');
                loginGateScreen.style.display = 'flex';
            }
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
                if (viewer) viewer.loadScene(bm.sceneId);
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
    // 5. Gated Auth Portal & Strict SCET Email Validation
    // ========================================================================
    function showAuthError(message = "") {
        if (!authErrorBanner) return;
        if (message) {
            authErrorBanner.textContent = message;
            authErrorBanner.classList.add('show');
        } else {
            authErrorBanner.classList.remove('show');
        }
    }

    function showAuthModal(message = "") {
        if (loginGateScreen) loginGateScreen.classList.remove('unlocked');
        if (tourAppContainer) {
            tourAppContainer.classList.remove('unlocked');
            tourAppContainer.style.display = 'none';
        }
        showAuthError(message);
    }

    // Dual User Type Selection Logic
    function setUserType(type) {
        selectedUserType = type;
        showAuthError('');

        if (type === 'campus') {
            if (typeScetBtn) {
                typeScetBtn.classList.add('active');
                typeScetBtn.setAttribute('aria-checked', 'true');
            }
            if (typeVisitorBtn) {
                typeVisitorBtn.classList.remove('active');
                typeVisitorBtn.setAttribute('aria-checked', 'false');
            }
            if (domainNoticeBadge) domainNoticeBadge.classList.remove('visitor');
            if (domainNoticeText) domainNoticeText.innerHTML = 'Official college domain: <strong>@scet.ac.in</strong>';
            if (signinDomainBadge) {
                signinDomainBadge.textContent = '@scet.ac.in';
                signinDomainBadge.classList.remove('visitor');
            }
            if (signupDomainBadge) {
                signupDomainBadge.textContent = '@scet.ac.in';
                signupDomainBadge.classList.remove('visitor');
            }
            if (signinEmail) signinEmail.placeholder = 'name@scet.ac.in';
            if (signupEmail) signupEmail.placeholder = 'name@scet.ac.in';
            if (signupRoleGroup) signupRoleGroup.style.display = 'block';
            if (googleAuthBtnText) googleAuthBtnText.textContent = 'Continue with SCET Google Account';
        } else {
            if (typeVisitorBtn) {
                typeVisitorBtn.classList.add('active');
                typeVisitorBtn.setAttribute('aria-checked', 'true');
            }
            if (typeScetBtn) {
                typeScetBtn.classList.remove('active');
                typeScetBtn.setAttribute('aria-checked', 'false');
            }
            if (domainNoticeBadge) domainNoticeBadge.classList.add('visitor');
            if (domainNoticeText) domainNoticeText.innerHTML = 'Open Access: <strong>Any Email Provider</strong>';
            if (signinDomainBadge) {
                signinDomainBadge.textContent = 'Any Email';
                signinDomainBadge.classList.add('visitor');
            }
            if (signupDomainBadge) {
                signupDomainBadge.textContent = 'Any Email';
                signupDomainBadge.classList.add('visitor');
            }
            if (signinEmail) signinEmail.placeholder = 'name@gmail.com';
            if (signupEmail) signupEmail.placeholder = 'name@gmail.com';
            if (signupRoleGroup) signupRoleGroup.style.display = 'none';
            if (googleAuthBtnText) googleAuthBtnText.textContent = 'Continue with Google';
        }
    }

    if (typeScetBtn) typeScetBtn.addEventListener('click', () => setUserType('campus'));
    if (typeVisitorBtn) typeVisitorBtn.addEventListener('click', () => setUserType('visitor'));

    // Sign Out Handler (immediately re-locks tour)
    if (authSignoutBtn) {
        authSignoutBtn.addEventListener('click', async () => {
            await authManager.signOutUser();
        });
    }

    // Tab Switching
    if (tabSignIn && tabSignUp) {
        tabSignIn.addEventListener('click', () => {
            tabSignIn.classList.add('active');
            tabSignUp.classList.remove('active');
            formSignIn.style.display = 'block';
            formSignUp.style.display = 'none';
            showAuthError('');
        });

        tabSignUp.addEventListener('click', () => {
            tabSignUp.classList.add('active');
            tabSignIn.classList.remove('active');
            formSignUp.style.display = 'block';
            formSignIn.style.display = 'none';
            showAuthError('');
        });
    }

    // Sign In Submit with Strict Regex Domain Validation
    if (formSignIn) {
        formSignIn.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (signinEmail ? signinEmail.value : '').trim();
            const password = document.getElementById('signin-password').value;
            const submitBtn = document.getElementById('btn-submit-signin');

            // Strict SCET Regex Check
            if (selectedUserType === 'campus' && !scetRegex.test(email)) {
                showAuthError("SCET Members must use their official @scet.ac.in college email ID.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Verifying & Entering...</span>';
            showAuthError('');

            const result = await authManager.signInWithEmail(email, password, selectedUserType);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Sign In to Tour</span>';

            if (result.success) {
                formSignIn.reset();
            } else {
                showAuthError(result.error);
            }
        });
    }

    // Sign Up Submit with Strict Regex Domain Validation
    if (formSignUp) {
        formSignUp.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signup-name').value.trim();
            const email = (signupEmail ? signupEmail.value : '').trim();
            const password = document.getElementById('signup-password').value;
            const roleSelect = document.getElementById('signup-role');
            const role = selectedUserType === 'campus' ? (roleSelect ? roleSelect.value : 'student') : 'visitor';
            const submitBtn = document.getElementById('btn-submit-signup');

            // Strict SCET Regex Check
            if (selectedUserType === 'campus' && !scetRegex.test(email)) {
                showAuthError("SCET Members must use their official @scet.ac.in college email ID.");
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span>Creating Account...</span>';
            showAuthError('');

            const result = await authManager.signUpWithEmail(email, password, name, selectedUserType, role);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Create Account & Enter</span>';

            if (result.success) {
                formSignUp.reset();
            } else {
                showAuthError(result.error);
            }
        });
    }

    // Google Sign-In with Domain Validation
    if (btnGoogleAuth) {
        btnGoogleAuth.addEventListener('click', async () => {
            showAuthError('');
            const res = await authManager.signInWithGoogle(selectedUserType);
            if (!res.success) {
                showAuthError(res.error);
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
                if (viewer) viewer.loadScene(key);
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
            if (mapSync) mapSync.setCategoryFilter(category);

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
            if (viewer) viewer.loadScene('admin_gate');
        });
    }

    // Compass Alignment
    if (compassWidget) {
        compassWidget.addEventListener('click', () => {
            if (viewer) viewer.resetOrientation();
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

    // Global Keybindings (ESC to close drawers and modals)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (infoModal) infoModal.classList.remove('active');
            if (bookmarksDrawer) bookmarksDrawer.classList.remove('active');
            if (reviewsModalBackdrop) reviewsModalBackdrop.classList.remove('active');
        }
    });
});
