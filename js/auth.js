// Firebase Authentication Service
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { app } from "./firebase-config.js";

const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Validates if the user has the admin role
 * @param {string} uid 
 * @returns {Promise<boolean>}
 */
async function isAdmin(uid) {
    // -- PRIMARY ADMIN BYPASS (Safe to keep for your main UID) --
    if (uid === 'fht1ygYzcDTBWpwgrT7qRrVpQgv1') {
        console.warn("DEBUG: Bypass triggered for primary admin.");
        return true;
    }

    // 1. Check in 'admin' collection (confirmed by user)
    try {
        const path = `admin/${uid}`;
        console.log(`Checking path: ${path}`);
        const adminDoc = await getDoc(doc(db, "admin", uid));
        if (adminDoc.exists()) {
            console.log("SUCCESS: Found in 'admin' collection");
            return true;
        } else {
            console.warn("NOT FOUND in 'admin' collection:", path);
        }
    } catch (error) {
        console.error("FAILED 'admin' collection check:", error.code, error.message);
    }
    
    // 2. Check in 'users' collection (backup check used by many security rules)
    try {
        const path = `users/${uid}`;
        console.log(`Checking path: ${path}`);
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log("SUCCESS: Found in 'users' collection:", userData);
            if (userData.role === 'admin') return true;
        } else {
            console.warn("NOT FOUND in 'users' collection:", path);
        }
    } catch (error) {
        console.error("FAILED 'users' collection check:", error.code, error.message);
    }

    return false;
}

/**
 * Handles the login process with role validation
 */
export async function login(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        const isUserAdmin = await isAdmin(user.uid);
        
        if (!isUserAdmin) {
            await signOut(auth);
            throw new Error("Unauthorized access. Admin role required.");
        }
        
        return user;
    } catch (error) {
        throw error;
    }
}

/**
 * Logs the user out and redirects to login
 */
export async function logout() {
    await signOut(auth);
    window.location.href = "index.html";
}

/**
 * Protects routes by checking auth state and admin role
 */
export function initAuthGuard(onAuthenticated) {
    onAuthStateChanged(auth, async (user) => {
        const isLoginPage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";
        
        if (user) {
            const isUserAdmin = await isAdmin(user.uid);
            if (isUserAdmin) {
                if (isLoginPage) {
                    window.location.href = "dashboard.html";
                } else {
                    document.getElementById("appBody")?.classList.remove("hidden");
                    if (onAuthenticated) onAuthenticated(user);
                }
            } else {
                await signOut(auth);
                if (!isLoginPage) window.location.href = "index.html?error=unauthorized";
            }
        } else {
            if (!isLoginPage) {
                window.location.href = "index.html";
            } else {
                document.getElementById("appBody")?.classList.remove("hidden"); // Login page is not hidden
            }
        }
    });
}
