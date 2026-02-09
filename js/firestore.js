// Firestore Data Service
import {
    getFirestore,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    getCountFromServer,
    doc,
    getDoc,
    updateDoc,
    startAfter
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { app } from "./firebase-config.js";

const db = getFirestore(app);

/**
 * Fetches high-level metrics for the dashboard
 */
export async function getDashboardMetrics() {
    try {
        const providersRef = collection(db, "providers");

        // Use parallel promises for efficiency
        const [totalCount, pendingCount, activeCount] = await Promise.all([
            getCountFromServer(providersRef),
            getCountFromServer(query(providersRef, where("status", "==", "pending"))),
            getCountFromServer(query(providersRef, where("status", "==", "active")))
        ]);

        return {
            total: totalCount.data().count,
            pending: pendingCount.data().count,
            active: activeCount.data().count,
            // Payments check might depend on a specific field or another collection
            paymentsPending: 0 // Placeholder logic
        };
    } catch (error) {
        console.error("Error fetching metrics:", error);
        return { total: 0, pending: 0, active: 0, paymentsPending: 0 };
    }
}

/**
 * Fetches the most recent providers, optionally filtered by status
 */
export async function getRecentProviders(limitCount = 10, status = null) {
    try {
        const providersRef = collection(db, "providers");
        let q;

        // Build query
        const constraints = [];
        if (status) {
            constraints.push(where("status", "==", status));
        }
        constraints.push(orderBy("createdAt", "desc"));
        constraints.push(limit(limitCount));

        try {
            q = query(providersRef, ...constraints);
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (innerError) {
            console.warn("Filtered OrderBy failed (likely missing index), fetching without order:", innerError);
            // Fallback: Use only status filter if order fails
            const fallbackConstraints = [];
            if (status) {
                fallbackConstraints.push(where("status", "==", status));
            }
            fallbackConstraints.push(limit(limitCount));

            q = query(providersRef, ...fallbackConstraints);
            const snapshot = await getDocs(q);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    } catch (error) {
        console.error("Error fetching providers:", error);
        return [];
    }
}

/**
 * Fetches a single provider by ID
 */
export async function getProviderById(id) {
    try {
        const docRef = doc(db, "providers", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching provider:", error);
        throw error;
    }
}

/**
 * Updates a provider's status or details
 */
export async function updateProviderStatus(id, updates) {
    try {
        const docRef = doc(db, "providers", id);
        await updateDoc(docRef, {
            ...updates,
            updatedAt: new Date().toISOString(),
            lastProcessedBy: "admin"
        });
    } catch (error) {
        console.error("Error updating provider:", error);
        throw error;
    }
}

/**
 * Fetches reviews for a specific provider (All at once - legacy)
 */
export async function getProviderReviews(providerId) {
    try {
        const reviewsRef = collection(db, "reviews");
        const q = query(
            reviewsRef,
            where("providerId", "==", providerId),
            orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching reviews:", error);
        return [];
    }
}

/**
 * Fetches reviews for a specific provider with pagination
 */
export async function getPaginatedReviews(providerId, limitCount = 4, lastDoc = null) {
    try {
        const reviewsRef = collection(db, "reviews");
        let q;

        const constraints = [
            where("providerId", "==", providerId),
            orderBy("createdAt", "desc"),
            limit(limitCount)
        ];

        if (lastDoc) {
            constraints.splice(2, 0, startAfter(lastDoc));
        }

        q = query(reviewsRef, ...constraints);
        const snapshot = await getDocs(q);

        const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const lastVisible = snapshot.docs[snapshot.docs.length - 1];

        return {
            reviews,
            lastDoc: lastVisible,
            hasMore: snapshot.docs.length === limitCount
        };
    } catch (error) {
        console.error("Error fetching paginated reviews:", error);
        return { reviews: [], lastDoc: null, hasMore: false };
    }
}
/**
 * Confirms a monthly subscription payment and updates the period dates
 */
export async function confirmSubscriptionPayment(id) {
    try {
        const docRef = doc(db, "providers", id);
        const now = new Date();

        // Calculate subscription dates
        const startDate = new Date(now);
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);

        const graceDate = new Date(endDate);
        graceDate.setDate(graceDate.getDate() + 5);

        await updateDoc(docRef, {
            subscriptionStartDate: startDate.toISOString(),
            subscriptionEndDate: endDate.toISOString(),
            gracePeriodEndDate: graceDate.toISOString(),
            lastPaymentDate: now.toISOString(),
            billingCycle: "monthly",
            updatedAt: now.toISOString(),
            lastProcessedBy: "admin"
        });
    } catch (error) {
        console.error("Error confirming subscription payment:", error);
        throw error;
    }
}
