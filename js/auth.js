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
    try {
        // Check in 'users' collection for role: 'admin'
        const userDoc = await getDoc(doc(db, "users", uid));
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            return true;
        }
        
        // Fallback: check in a dedicated 'admins' collection if that's the structure
        const adminDoc = await getDoc(doc(db, "admins", uid));
        return adminDoc.exists();
    } catch (error) {
        console.error("Error checking admin status:", error);
        return false;
    }
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
