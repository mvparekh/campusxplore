/**
 * CampusXplore - Authentication & Cloud Firestore Controller
 * Integrates Firebase Auth (Email/Password, Google Sign-In) and Firestore DB
 * Includes graceful localStorage fallback mode for offline/demo operation.
 */

import { auth, db, isFirebaseConfigured } from "./firebaseConfig.js";

import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup, 
    updateProfile 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

import { 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    addDoc, 
    deleteDoc, 
    serverTimestamp,
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.authStateListeners = [];
        this.localBookmarksKey = "campusxplore_local_bookmarks";
        this.localReviewsKey = "campusxplore_local_reviews";
        this.localUserKey = "campusxplore_local_user";
    }

    /**
     * Initializes authentication state observer
     * @param {Function} onUserStateChanged Callback when auth state changes
     */
    initAuth(onUserStateChanged) {
        if (typeof onUserStateChanged === 'function') {
            this.authStateListeners.push(onUserStateChanged);
        }

        if (isFirebaseConfigured && auth) {
            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    let userRole = 'student';
                    try {
                        const userDoc = await getDoc(doc(db, "users", user.uid));
                        if (userDoc.exists()) {
                            userRole = userDoc.data().role || 'student';
                        }
                    } catch (e) {
                        console.warn("[CampusXplore] Could not fetch user profile document:", e);
                    }

                    this.currentUser = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        photoURL: user.photoURL || null,
                        role: userRole
                    };
                } else {
                    this.currentUser = null;
                }
                this.notifyAuthState();
            });
        } else {
            // LocalStorage Mock Mode
            const savedLocalUser = localStorage.getItem(this.localUserKey);
            if (savedLocalUser) {
                try {
                    this.currentUser = JSON.parse(savedLocalUser);
                } catch (e) {
                    this.currentUser = null;
                }
            }
            this.notifyAuthState();
        }
    }

    notifyAuthState() {
        this.authStateListeners.forEach(listener => {
            try {
                listener(this.currentUser);
            } catch (err) {
                console.error("[CampusXplore] AuthState listener error:", err);
            }
        });
    }

    getCurrentUser() {
        return this.currentUser;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }

    /**
     * Register a new user with email and password
     */
    async signUpWithEmail(email, password, displayName, role = 'student') {
        if (isFirebaseConfigured && auth) {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Update auth profile
                if (displayName) {
                    await updateProfile(user, { displayName });
                }

                // Create initial profile in Firestore
                await setDoc(doc(db, "users", user.uid), {
                    email: user.email,
                    displayName: displayName || user.email.split('@')[0],
                    role: role,
                    createdAt: serverTimestamp()
                });

                return { success: true, user: this.currentUser };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation
            const mockUser = {
                uid: "local_" + Date.now(),
                email: email,
                displayName: displayName || email.split('@')[0],
                role: role
            };
            this.currentUser = mockUser;
            localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
            this.notifyAuthState();
            return { success: true, user: mockUser };
        }
    }

    /**
     * Authenticate an existing user with email and password
     */
    async signInWithEmail(email, password) {
        if (isFirebaseConfigured && auth) {
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                return { success: true, user: userCredential.user };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation
            const mockUser = {
                uid: "local_" + btoa(email).substring(0, 8),
                email: email,
                displayName: email.split('@')[0],
                role: 'student'
            };
            this.currentUser = mockUser;
            localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
            this.notifyAuthState();
            return { success: true, user: mockUser };
        }
    }

    /**
     * Optional One-Click Google Sign-In Popup
     */
    async signInWithGoogle() {
        if (isFirebaseConfigured && auth) {
            try {
                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                const user = result.user;

                // Ensure user profile document exists
                const userDocRef = doc(db, "users", user.uid);
                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists()) {
                    await setDoc(userDocRef, {
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        role: 'visitor',
                        createdAt: serverTimestamp()
                    });
                }

                return { success: true, user };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation
            const mockUser = {
                uid: "google_local_user",
                email: "google.student@scet.ac.in",
                displayName: "SCET Student",
                role: "student"
            };
            this.currentUser = mockUser;
            localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
            this.notifyAuthState();
            return { success: true, user: mockUser };
        }
    }

    /**
     * Signs out the active user
     */
    async signOutUser() {
        if (isFirebaseConfigured && auth) {
            try {
                await signOut(auth);
                this.currentUser = null;
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        } else {
            this.currentUser = null;
            localStorage.removeItem(this.localUserKey);
            this.notifyAuthState();
            return { success: true };
        }
    }

    /**
     * Toggles a bookmark for the current user
     * @param {string} sceneId
     * @param {string} sceneTitle
     */
    async toggleBookmark(sceneId, sceneTitle) {
        if (!this.currentUser) {
            return { success: false, requireAuth: true, error: "Please sign in to save campus bookmarks." };
        }

        const userId = this.currentUser.uid;

        if (isFirebaseConfigured && db) {
            try {
                const bookmarksRef = collection(db, "bookmarks");
                const q = query(bookmarksRef, where("userId", "==", userId), where("sceneId", "==", sceneId));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    // Already bookmarked -> Remove it
                    const docToDelete = querySnapshot.docs[0];
                    await deleteDoc(doc(db, "bookmarks", docToDelete.id));
                    return { success: true, isBookmarked: false, message: "Bookmark removed." };
                } else {
                    // Not bookmarked -> Add it
                    await addDoc(bookmarksRef, {
                        userId: userId,
                        sceneId: sceneId,
                        sceneTitle: sceneTitle || sceneId,
                        timestamp: serverTimestamp()
                    });
                    return { success: true, isBookmarked: true, message: "Saved to bookmarks!" };
                }
            } catch (error) {
                console.error("[CampusXplore] Error toggling bookmark:", error);
                return { success: false, error: error.message };
            }
        } else {
            // Local fallback
            const bookmarks = this.getLocalBookmarks(userId);
            const index = bookmarks.findIndex(b => b.sceneId === sceneId);
            let isBookmarked = false;

            if (index > -1) {
                bookmarks.splice(index, 1);
                isBookmarked = false;
            } else {
                bookmarks.push({
                    id: "local_bm_" + Date.now(),
                    userId: userId,
                    sceneId: sceneId,
                    sceneTitle: sceneTitle || sceneId,
                    timestamp: new Date().toISOString()
                });
                isBookmarked = true;
            }

            this.saveLocalBookmarks(userId, bookmarks);
            return { 
                success: true, 
                isBookmarked, 
                message: isBookmarked ? "Saved to bookmarks (Local Mode)!" : "Bookmark removed." 
            };
        }
    }

    /**
     * Checks if a specific scene is bookmarked by the current user
     */
    async isSceneBookmarked(sceneId) {
        if (!this.currentUser) return false;
        const bookmarks = await this.getUserBookmarks(this.currentUser.uid);
        return bookmarks.some(b => b.sceneId === sceneId);
    }

    /**
     * Retrieves all saved bookmarks for a given user
     */
    async getUserBookmarks(userId) {
        if (!userId && this.currentUser) userId = this.currentUser.uid;
        if (!userId) return [];

        if (isFirebaseConfigured && db) {
            try {
                const bookmarksRef = collection(db, "bookmarks");
                const q = query(bookmarksRef, where("userId", "==", userId));
                const querySnapshot = await getDocs(q);
                const results = [];
                querySnapshot.forEach(doc => {
                    results.push({ id: doc.id, ...doc.data() });
                });
                return results;
            } catch (error) {
                console.error("[CampusXplore] Error fetching bookmarks:", error);
                return this.getLocalBookmarks(userId);
            }
        } else {
            return this.getLocalBookmarks(userId);
        }
    }

    /**
     * Submits a campus review/feedback note to Firestore
     */
    async submitReview(sceneId, rating, comment) {
        if (!this.currentUser) {
            return { success: false, requireAuth: true, error: "Please sign in to submit location reviews." };
        }

        const reviewData = {
            userId: this.currentUser.uid,
            userEmail: this.currentUser.email,
            sceneId: sceneId,
            rating: Math.max(1, Math.min(5, parseInt(rating) || 5)),
            comment: (comment || "").trim().substring(0, 500),
            createdAt: serverTimestamp()
        };

        if (isFirebaseConfigured && db) {
            try {
                const docRef = await addDoc(collection(db, "reviews"), reviewData);
                return { success: true, id: docRef.id };
            } catch (error) {
                console.error("[CampusXplore] Error submitting review:", error);
                return { success: false, error: error.message };
            }
        } else {
            // Local fallback
            const allReviews = this.getLocalReviews();
            const newReview = {
                id: "local_rev_" + Date.now(),
                ...reviewData,
                createdAt: new Date().toISOString()
            };
            allReviews.unshift(newReview);
            localStorage.setItem(this.localReviewsKey, JSON.stringify(allReviews));
            return { success: true, id: newReview.id };
        }
    }

    /**
     * Retrieves reviews for a given scene
     */
    async getSceneReviews(sceneId) {
        if (isFirebaseConfigured && db) {
            try {
                const reviewsRef = collection(db, "reviews");
                const q = query(reviewsRef, where("sceneId", "==", sceneId));
                const querySnapshot = await getDocs(q);
                const results = [];
                querySnapshot.forEach(doc => {
                    results.push({ id: doc.id, ...doc.data() });
                });
                return results;
            } catch (error) {
                console.error("[CampusXplore] Error fetching reviews:", error);
                return this.getLocalReviews().filter(r => r.sceneId === sceneId);
            }
        } else {
            return this.getLocalReviews().filter(r => r.sceneId === sceneId);
        }
    }

    /**
     * Telemetry logging for scene visits
     */
    async logVisit(sceneId, userId = 'anonymous') {
        const visitData = {
            userId: this.currentUser ? this.currentUser.uid : userId,
            sceneId: sceneId,
            timestamp: serverTimestamp()
        };

        if (isFirebaseConfigured && db) {
            try {
                await addDoc(collection(db, "visit_logs"), visitData);
            } catch (e) {
                // Non-critical telemetry, fail silently
            }
        }
    }

    // --- Helper Methods ---

    getLocalBookmarks(userId) {
        try {
            const raw = localStorage.getItem(`${this.localBookmarksKey}_${userId}`);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    saveLocalBookmarks(userId, bookmarks) {
        try {
            localStorage.setItem(`${this.localBookmarksKey}_${userId}`, JSON.stringify(bookmarks));
        } catch (e) {}
    }

    getLocalReviews() {
        try {
            const raw = localStorage.getItem(this.localReviewsKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    formatAuthError(error) {
        if (!error || !error.code) return error ? error.message : "An error occurred.";
        switch (error.code) {
            case 'auth/invalid-email':
                return 'Please enter a valid email address.';
            case 'auth/user-disabled':
                return 'This account has been disabled.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return 'Incorrect email or password.';
            case 'auth/email-already-in-use':
                return 'An account with this email already exists.';
            case 'auth/weak-password':
                return 'Password must be at least 6 characters.';
            case 'auth/popup-closed-by-user':
                return 'Google Sign-In was cancelled.';
            case 'auth/network-request-failed':
                return 'Network error. Please check your internet connection.';
            default:
                return error.message;
        }
    }
}

export const authManager = new AuthManager();
export default authManager;

