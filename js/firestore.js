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
 * Fetches all providers that are currently hidden from the public search page.
 * Combines Firestore-filtered queries (rejected/pending) with client-side
 * evaluation of availability status, subscription expiry, and document expiry.
 *
 * @returns {Promise<Array>} Array of provider objects, each with a `hiddenReasons` string[].
 */
export async function getHiddenProviders() {
    try {
        const providersRef = collection(db, "providers");
        const now = new Date();

        // --- 1. Firestore-filtered: status-based hidden providers ---
        const [rejectedSnap, pendingSnap, activeSnap] = await Promise.all([
            getDocs(query(providersRef, where("status", "==", "rejected"), limit(200))),
            getDocs(query(providersRef, where("status", "==", "pending"), limit(200))),
            getDocs(query(providersRef, where("status", "==", "active"), limit(200)))
        ]);

        const toObj = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

        const rejectedProviders = toObj(rejectedSnap).map(p => ({
            ...p,
            hiddenReasons: ["Profile Rejected by Admin"]
        }));

        const pendingProviders = toObj(pendingSnap).map(p => ({
            ...p,
            hiddenReasons: ["Pending Admin Approval"]
        }));

        // --- 2. Client-side evaluation for active providers ---
        const activeProviders = toObj(activeSnap);
        const activeHidden = [];

        for (const p of activeProviders) {
            const reasons = [];

            // Availability status
            const avail = (p.availabilityStatus || "").toLowerCase();
            if (avail === "full" || avail === "fully booked") {
                reasons.push("Fully Booked");
            } else if (avail === "unavailable" || avail === "temporary" || avail === "temporarily unavailable") {
                reasons.push("Temporarily Unavailable");
            }

            // Subscription expiry
            const subEnd = p.subscriptionEndDate ? new Date(
                typeof p.subscriptionEndDate === "object" && p.subscriptionEndDate.seconds
                    ? p.subscriptionEndDate.seconds * 1000
                    : p.subscriptionEndDate
            ) : null;
            const graceEnd = p.gracePeriodEndDate ? new Date(
                typeof p.gracePeriodEndDate === "object" && p.gracePeriodEndDate.seconds
                    ? p.gracePeriodEndDate.seconds * 1000
                    : p.gracePeriodEndDate
            ) : null;

            const subExpired = !subEnd || now > subEnd;
            const graceExpired = !graceEnd || now > graceEnd;
            if (subExpired && graceExpired) {
                reasons.push("Subscription Not Paid / Expired");
            }

            // Document expiry — PrDP
            const prdpExpiry = p.documents?.prdpExpiry ? new Date(
                typeof p.documents.prdpExpiry === "object" && p.documents.prdpExpiry.seconds
                    ? p.documents.prdpExpiry.seconds * 1000
                    : p.documents.prdpExpiry
            ) : null;
            if (prdpExpiry && now > prdpExpiry) {
                reasons.push("PrDP Permit Expired");
            }

            // Document expiry — Roadworthy
            const rwExpiry = p.documents?.roadworthyExpiry ? new Date(
                typeof p.documents.roadworthyExpiry === "object" && p.documents.roadworthyExpiry.seconds
                    ? p.documents.roadworthyExpiry.seconds * 1000
                    : p.documents.roadworthyExpiry
            ) : null;
            if (rwExpiry && now > rwExpiry) {
                reasons.push("Roadworthy Certificate Expired");
            }

            if (reasons.length > 0) {
                activeHidden.push({ ...p, hiddenReasons: reasons });
            }
        }

        // --- 3. Merge all hidden providers (deduplicated by id) ---
        const seen = new Set();
        const merged = [];
        for (const p of [...rejectedProviders, ...pendingProviders, ...activeHidden]) {
            if (!seen.has(p.id)) {
                seen.add(p.id);
                merged.push(p);
            }
        }

        return merged;
    } catch (error) {
        console.error("Error fetching hidden providers:", error);
        return [];
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
