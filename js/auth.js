/**
 * CampusXplore - Authentication & Cloud Firestore Controller
 * Integrates Firebase Auth (Email/Password, Google Sign-In) and Firestore DB.
 * Implements strict domain validation (@scet.ac.in) for SCET campus members.
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
    serverTimestamp 
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
                    let userType = user.email.toLowerCase().endsWith('@scet.ac.in') ? 'campus' : 'visitor';
                    let domain = user.email.split('@')[1] || '';

                    try {
                        const userDoc = await getDoc(doc(db, "users", user.uid));
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            userRole = data.role || userRole;
                            userType = data.userType || userType;
                            domain = data.domain || domain;
                        }
                    } catch (e) {
                        console.warn("[CampusXplore] Could not fetch user profile document:", e);
                    }

                    this.currentUser = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        photoURL: user.photoURL || null,
                        role: userRole,
                        userType: userType,
                        domain: domain
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
     * Enforces strict @scet.ac.in domain for campus members
     */
    async signUpWithEmail(email, password, displayName, userType = 'campus', role = 'student') {
        const emailLower = (email || '').trim().toLowerCase();
        const isScetEmail = emailLower.endsWith('@scet.ac.in');

        // Strict Domain Check
        if (userType === 'campus' && !isScetEmail) {
            return {
                success: false,
                error: "SCET campus members must use their official @scet.ac.in email address."
            };
        }

        const resolvedUserType = isScetEmail ? 'campus' : 'visitor';
        const resolvedRole = isScetEmail ? (role || 'student') : 'visitor';
        const domain = emailLower.includes('@') ? emailLower.split('@')[1] : '';

        if (isFirebaseConfigured && auth) {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, emailLower, password);
                const user = userCredential.user;

                // Update auth display name
                if (displayName) {
                    await updateProfile(user, { displayName });
                }

                // Store comprehensive profile metadata in Firestore
                const userData = {
                    uid: user.uid,
                    email: emailLower,
                    displayName: displayName || emailLower.split('@')[0],
                    role: resolvedRole,
                    userType: resolvedUserType,
                    domain: domain,
                    createdAt: serverTimestamp(),
                    lastLoginAt: serverTimestamp()
                };

                await setDoc(doc(db, "users", user.uid), userData);

                this.currentUser = {
                    uid: user.uid,
                    email: emailLower,
                    displayName: displayName || emailLower.split('@')[0],
                    role: resolvedRole,
                    userType: resolvedUserType,
                    domain: domain
                };
                this.notifyAuthState();

                return { success: true, user: this.currentUser };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation with exact same domain enforcement
            const mockUser = {
                uid: "local_" + Date.now(),
                email: emailLower,
                displayName: displayName || emailLower.split('@')[0],
                role: resolvedRole,
                userType: resolvedUserType,
                domain: domain,
                createdAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
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
    async signInWithEmail(email, password, userType = 'campus') {
        const emailLower = (email || '').trim().toLowerCase();
        const isScetEmail = emailLower.endsWith('@scet.ac.in');

        // Strict Domain Check
        if (userType === 'campus' && !isScetEmail) {
            return {
                success: false,
                error: "SCET campus members must use their official @scet.ac.in email address."
            };
        }

        if (isFirebaseConfigured && auth) {
            try {
                const userCredential = await signInWithEmailAndPassword(auth, emailLower, password);
                const user = userCredential.user;

                // Update lastLoginAt timestamp in Firestore
                try {
                    await setDoc(doc(db, "users", user.uid), {
                        lastLoginAt: serverTimestamp()
                    }, { merge: true });
                } catch (e) {
                    console.warn("[CampusXplore] Could not update lastLoginAt:", e);
                }

                return { success: true, user };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation
            const resolvedUserType = isScetEmail ? 'campus' : 'visitor';
            const domain = emailLower.includes('@') ? emailLower.split('@')[1] : '';

            const mockUser = {
                uid: "local_" + btoa(emailLower).substring(0, 8),
                email: emailLower,
                displayName: emailLower.split('@')[0],
                role: isScetEmail ? 'student' : 'visitor',
                userType: resolvedUserType,
                domain: domain,
                lastLoginAt: new Date().toISOString()
            };
            this.currentUser = mockUser;
            localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
            this.notifyAuthState();
            return { success: true, user: mockUser };
        }
    }

    /**
     * One-Click Google Sign-In Popup with domain enforcement
     */
    async signInWithGoogle(userType = 'campus') {
        if (isFirebaseConfigured && auth) {
            try {
                const provider = new GoogleAuthProvider();
                const result = await signInWithPopup(auth, provider);
                const user = result.user;
                const emailLower = (user.email || '').trim().toLowerCase();
                const isScetEmail = emailLower.endsWith('@scet.ac.in');

                if (userType === 'campus' && !isScetEmail) {
                    await signOut(auth);
                    return {
                        success: false,
                        error: "SCET campus members must use their official @scet.ac.in email address."
                    };
                }

                const resolvedUserType = isScetEmail ? 'campus' : 'visitor';
                const domain = emailLower.includes('@') ? emailLower.split('@')[1] : '';

                // Upsert user metadata in Firestore
                const userDocRef = doc(db, "users", user.uid);
                await setDoc(userDocRef, {
                    uid: user.uid,
                    email: emailLower,
                    displayName: user.displayName || emailLower.split('@')[0],
                    role: isScetEmail ? 'student' : 'visitor',
                    userType: resolvedUserType,
                    domain: domain,
                    lastLoginAt: serverTimestamp()
                }, { merge: true });

                return { success: true, user };
            } catch (error) {
                return { success: false, error: this.formatAuthError(error) };
            }
        } else {
            // Local fallback simulation
            if (userType === 'campus') {
                const mockUser = {
                    uid: "google_scet_user",
                    email: "student@scet.ac.in",
                    displayName: "SCET Student",
                    role: "student",
                    userType: "campus",
                    domain: "scet.ac.in",
                    lastLoginAt: new Date().toISOString()
                };
                this.currentUser = mockUser;
                localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
                this.notifyAuthState();
                return { success: true, user: mockUser };
            } else {
                const mockUser = {
                    uid: "google_visitor_user",
                    email: "visitor@gmail.com",
                    displayName: "Campus Visitor",
                    role: "visitor",
                    userType: "visitor",
                    domain: "gmail.com",
                    lastLoginAt: new Date().toISOString()
                };
                this.currentUser = mockUser;
                localStorage.setItem(this.localUserKey, JSON.stringify(mockUser));
                this.notifyAuthState();
                return { success: true, user: mockUser };
            }
        }
    }

    /**
     * Signs out the active user and clears local auth UI
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
                    await deleteDoc(doc(db, "bookmarks", querySnapshot.docs[0].id));
                    return { success: true, isBookmarked: false, message: "Bookmark removed." };
                } else {
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

    async isSceneBookmarked(sceneId) {
        if (!this.currentUser) return false;
        const bookmarks = await this.getUserBookmarks(this.currentUser.uid);
        return bookmarks.some(b => b.sceneId === sceneId);
    }

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

    async logVisit(sceneId, userId = 'anonymous') {
        const visitData = {
            userId: this.currentUser ? this.currentUser.uid : userId,
            sceneId: sceneId,
            timestamp: serverTimestamp()
        };

        if (isFirebaseConfigured && db) {
            try {
                await addDoc(collection(db, "visit_logs"), visitData);
            } catch (e) {}
        }
    }

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
