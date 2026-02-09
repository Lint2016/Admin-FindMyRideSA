// Main Application Controller
import { login, logout, initAuthGuard } from "./auth.js";
import { getDashboardMetrics, getRecentProviders, getProviderById, updateProviderStatus, getPaginatedReviews, confirmSubscriptionPayment } from "./firestore.js";

// DOM Elements
const loginForm = document.getElementById("loginForm");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logoutBtn");
const providerTableBody = document.getElementById("providerTableBody");
const searchInput = document.getElementById("searchInput");
const searchWrapper = document.getElementById("search-wrapper");

let allProviders = []; // Global store for client-side filtering
let currentFilter = null;
let isPaymentView = false;

// Profile Page Elements
const profileName = document.getElementById("provider-name");
const statusBadgeContainer = document.getElementById("status-badge-container");
const docGrid = document.getElementById("doc-grid");
const rejectionNote = document.getElementById("rejectionNote");

// Pagination State
let lastReviewDoc = null;
let currentProviderId = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initAuthGuard(async (user) => {
        const path = window.location.pathname;
        if (path.endsWith("dashboard.html")) {
            initDashboard(user);
        } else if (path.endsWith("provider-profile.html")) {
            initProfileView(user);
        }
    });
});

// --- Dashboard Logic ---
async function initDashboard(user) {
    const adminEmailEl = document.getElementById("admin-email");
    if (adminEmailEl) adminEmailEl.textContent = user.email;

    // Initial metrics load
    await refreshMetrics();

    // Initial data load (All recent)
    allProviders = await getRecentProviders(50); // Fetch more for better search experience
    renderProviderTable(allProviders);

    // Setup sidebar filters
    setupDashboardFilters();

    // Setup Search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            const filtered = allProviders.filter(p => {
                const name = (p.fullName || p.name || "").toLowerCase();
                const phone = (p.phoneNumber || p.phone || "").toLowerCase();
                return name.includes(term) || phone.includes(term);
            });

            if (isPaymentView) {
                renderPaymentTable(filtered, `No payments found matching "${term}"`);
            } else {
                renderProviderTable(filtered, `No providers found matching "${term}"`);
            }
        });
    }
}

async function refreshMetrics() {
    const metrics = await getDashboardMetrics();
    updateStat("stat-total", metrics.total);
    updateStat("stat-pending", metrics.pending);
    updateStat("stat-active", metrics.active);
    updateStat("stat-payments", metrics.paymentsPending);
}

function setupDashboardFilters() {
    const filters = [
        { id: 'filter-dashboard', status: null, title: 'Overview', tableTitle: 'Recent Provider Registrations', isPayments: false },
        { id: 'filter-pending', status: 'pending', title: 'Pending Providers', tableTitle: 'Providers Awaiting Approval', isPayments: false },
        { id: 'filter-active', status: 'active', title: 'Active Providers', tableTitle: 'Live Service Providers', isPayments: false },
        { id: 'filter-payments', status: null, title: 'Payments', tableTitle: 'Financial Overview', isPayments: true },
        { id: 'filter-pay-reg', status: 'reg', title: 'Registration Payments', tableTitle: 'Provider Registration Fees', isPayments: true },
        { id: 'filter-pay-sub', status: 'sub', title: 'Subscription Payments', tableTitle: 'Monthly Subscription Renewals', isPayments: true }
    ];

    filters.forEach(filter => {
        const btn = document.getElementById(filter.id);
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();

                // Update UI State
                document.querySelectorAll('.nav-link, .nav-sub-link').forEach(link => link.classList.remove('active'));
                btn.classList.add('active');

                // If it's a sub-link, also activate the parent
                if (btn.classList.contains('nav-sub-link')) {
                    document.getElementById('filter-payments')?.classList.add('active');
                }

                // Update View State
                isPaymentView = filter.isPayments;
                currentFilter = filter.status;
                if (searchWrapper) searchWrapper.style.display = isPaymentView ? 'block' : 'none';
                if (searchInput) searchInput.value = '';

                const pageTitle = document.getElementById('page-title');
                const tableTitle = document.getElementById('table-title');
                if (pageTitle) pageTitle.textContent = filter.title;
                if (tableTitle) tableTitle.textContent = filter.tableTitle;

                // Update Table Header
                updateTableHeader(isPaymentView, currentFilter);

                // Show loading state in table
                if (providerTableBody) {
                    providerTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';
                }

                // Fetch and render
                // For pay-reg and pay-sub, we still fetch recent providers but filter logic in render
                const fetchStatus = (filter.status === 'reg' || filter.status === 'sub') ? null : filter.status;
                allProviders = await getRecentProviders(filter.isPayments ? 100 : 20, fetchStatus);

                if (isPaymentView) {
                    renderPaymentTable(allProviders, filter.status);
                } else {
                    const emptyMsg = filter.status
                        ? `No providers found with status: ${filter.status.toUpperCase()}`
                        : "No providers found in the database.";
                    renderProviderTable(allProviders, emptyMsg);
                }

                // Refresh stats too
                await refreshMetrics();
            });
        }
    });
}

function updateTableHeader(isPayments, paymentType = null) {
    const tableHead = document.getElementById('tableHead');
    if (!tableHead) return;

    if (isPayments) {
        if (paymentType === 'sub') {
            tableHead.innerHTML = `
                <tr>
                    <th>Provider Name</th>
                    <th>Subscription End</th>
                    <th>Status</th>
                    <th>Last Payment</th>
                    <th>Billing</th>
                    <th>Action</th>
                </tr>
            `;
        } else {
            tableHead.innerHTML = `
                <tr>
                    <th>Provider Name</th>
                    <th>Phone Number</th>
                    <th>Payment Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Action</th>
                </tr>
            `;
        }
    } else {
        tableHead.innerHTML = `
            <tr>
                <th>Provider Name</th>
                <th>Service Area</th>
                <th>Source</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
            </tr>
        `;
    }
}

// --- Profile View Logic ---
async function initProfileView(user) {
    const urlParams = new URLSearchParams(window.location.search);
    const providerId = urlParams.get("id");

    if (!providerId) {
        window.location.href = "dashboard.html";
        return;
    }

    try {
        const provider = await getProviderById(providerId);
        if (!provider) throw new Error("Provider not found");

        renderProfileData(provider);

        // Fetch and render initial reviews
        currentProviderId = providerId;
        await fetchAndRenderReviews(providerId, true);

        setupProfileActions(providerId);
    } catch (error) {
        console.error(error);
        alert("Error loading provider profile.");
    }
}

function renderProfileData(provider) {
    const name = provider.fullName || provider.name || provider.businessName || "Unnamed Provider";
    const area = getArea(provider);
    const source = getSource(provider);

    if (profileName) profileName.textContent = name;

    // Status Badge
    if (statusBadgeContainer) {
        statusBadgeContainer.innerHTML = `
            ${renderStatusBadge(provider.status)}
            ${renderAvailabilityBadge(provider.availabilityStatus)}
        `;
    }

    // Personal Info
    setVal("val-email", provider.email);

    const phone = provider.phoneNumber || provider.phone;
    const phoneEl = document.getElementById("val-phone");
    if (phoneEl && phone) {
        const waLink = formatWhatsAppLink(phone);
        phoneEl.innerHTML = `
            <a href="${waLink}" target="_blank" title="Chat on WhatsApp" style="text-decoration: none; color: #128C7E; font-weight: 600; display: inline-flex; align-items: center; gap: 0.25rem;">
                <i data-lucide="message-square" style="width: 14px; height: 14px;"></i>
                ${phone}
            </a>
        `;
    } else {
        setVal("val-phone", phone || "-");
    }

    setVal("val-area", area);
    setVal("val-joined", formatDate(provider.createdAt || provider.timestamp));

    // Source
    setVal("val-source-type", source.type);

    if (source.type === "Referral" || source.type === "friend") {
        document.getElementById("row-referral").style.display = "flex";
        setVal("val-referral-name", source.referredName);
    }

    // Payment
    const paymentContainer = document.getElementById("payment-status-info");
    if (paymentContainer) {
        paymentContainer.innerHTML = renderPaymentBadge(provider.paymentStatus);
    }

    // Documents
    renderDocuments(provider.documents);

    // Compliance Expiries (Roadworthy & PrDP)
    renderComplianceExpiries(provider);

    // Monthly Subscription
    renderSubscriptionData(provider);

    // Re-init icons for the phone link
    if (window.lucide) window.lucide.createIcons();
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "N/A";
}

function renderDocuments(docs) {
    if (!docGrid) return;
    if (!docs || Object.keys(docs).length === 0) {
        docGrid.innerHTML = '<p style="color: var(--text-muted);">No documents uploaded.</p>';
        return;
    }

    docGrid.innerHTML = Object.entries(docs)
        .filter(([key, url]) => typeof url === 'string' && url.startsWith('http'))
        .map(([key, url]) => {
            const isPdf = typeof url === 'string' && (
                url.toLowerCase().split('?')[0].endsWith('.pdf') ||
                url.includes('format=pdf') ||
                url.includes('/pdf') ||
                url.includes('google-apps.pdf')
            );

            return `
            <div class="doc-card">
                <div class="doc-preview ${isPdf ? 'pdf-preview' : ''}" onclick="openZoom('${url}', '${key}')">
                    ${isPdf ? `
                        <div class="pdf-icon">PDF</div>
                        <span style="font-size: 0.7rem; font-weight: 600;">Click to View</span>
                    ` : `
                        <img src="${url}" alt="${key}">
                    `}
                </div>
                <div class="doc-info">
                    <div style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">${key.replace(/([A-Z])/g, ' $1')}</div>
                </div>
            </div>
        `;
        }).join('');
}

async function fetchAndRenderReviews(providerId, reset = false) {
    if (reset) {
        lastReviewDoc = null;
        const container = document.getElementById("review-container");
        if (container) container.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">Loading reviews...</p>';
    }

    const { reviews, lastDoc, hasMore } = await getPaginatedReviews(providerId, 4, lastReviewDoc);

    lastReviewDoc = lastDoc;
    renderReviews(reviews, reset);

    const loadMoreBtn = document.getElementById("load-more-container");
    if (loadMoreBtn) {
        loadMoreBtn.style.display = hasMore ? 'flex' : 'none';
    }
}

function renderReviews(reviews, clearContainer = false) {
    const container = document.getElementById("review-container");
    if (!container) return;

    if (clearContainer && (!reviews || reviews.length === 0)) {
        container.innerHTML = '<p style="color: var(--text-muted);">No reviews yet.</p>';
        return;
    }

    const reviewsHtml = reviews.map(review => {
        const rating = review.rating || 0;
        const stars = Array(5).fill(0).map((_, i) =>
            `<i data-lucide="star" style="width: 14px; height: 14px; ${i < rating ? 'fill: #f59e0b; color: #f59e0b;' : 'color: #cbd5e1;'}"></i>`
        ).join('');

        const date = formatDate(review.createdAt);
        const userName = getReviewerName(review);
        const comment = review.comment || review.text || review.message || "No comment provided.";

        // Provider Response Logic
        const response = review.providerResponse;
        const responseHtml = response ? `
            <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-light); border-left: 3px solid var(--primary-color); border-radius: 4px; font-size: 0.825rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                    <i data-lucide="message-square" style="width: 14px; height: 14px; color: var(--primary-color);"></i>
                    <span style="font-weight: 700; color: var(--text-main);">Provider Response</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted); margin-left: auto;">${formatDate(response.timestamp || response.date)}</span>
                </div>
                <p style="color: var(--text-main); line-height: 1.5; font-style: italic;">"${response.text || response.message || response}"</p>
            </div>
        ` : '';

        return `
            <div style="border-bottom: 1px solid var(--border-color); padding: 1rem 0;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="font-weight: 600; font-size: 0.875rem;">${userName}</div>
                        <div style="display: flex; gap: 2px;">${stars}</div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${date}</div>
                </div>
                <p style="font-size: 0.875rem; color: var(--text-main); line-height: 1.4;">${comment}</p>
                ${responseHtml}
            </div>
        `;
    }).join('');

    if (clearContainer) {
        container.innerHTML = reviewsHtml;
    } else {
        container.insertAdjacentHTML('beforeend', reviewsHtml);
    }

    // re-init icons for the new review stars
    if (window.lucide) window.lucide.createIcons();
}

function setupProfileActions(providerId) {
    const approveBtn = document.getElementById("approveProviderBtn");
    const rejectBtn = document.getElementById("rejectProviderBtn");
    const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");
    const confirmSubscriptionBtn = document.getElementById("confirmSubscriptionBtn");

    approveBtn?.addEventListener("click", () => {
        const modal = document.getElementById('activationModal');
        if (modal) modal.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    });

    // --- Rejection Modal Logic ---
    const rejectionModal = document.getElementById('rejectionModal');
    const modalNote = document.getElementById('modalRejectionNote');
    const confirmRejectionBtn = document.getElementById('confirmRejectionBtn');
    const cancelRejection = document.getElementById('cancelRejection');
    const closeRejection = document.getElementById('closeRejection');

    rejectBtn?.addEventListener("click", () => {
        if (rejectionModal) rejectionModal.style.display = 'flex';
        if (modalNote) modalNote.value = '';
        if (window.lucide) window.lucide.createIcons();
    });

    const closeModal = () => {
        if (rejectionModal) rejectionModal.style.display = 'none';
    };

    [cancelRejection, closeRejection].forEach(btn => {
        btn?.addEventListener('click', closeModal);
    });

    confirmRejectionBtn?.addEventListener('click', async () => {
        const note = modalNote?.value.trim();
        if (!note) {
            alert("Please provide a reason for rejection.");
            return;
        }

        confirmRejectionBtn.disabled = true;
        confirmRejectionBtn.textContent = 'Processing...';

        try {
            await handleStatusUpdate(providerId, {
                status: "rejected",
                verified: false,
                rejectionReason: note
            }, "Provider Rejected", "The provider has been notified and delisted from search.");
            closeModal();
        } catch (error) {
            confirmRejectionBtn.disabled = false;
            confirmRejectionBtn.textContent = 'Reject Provider';
        }
    });

    confirmPaymentBtn?.addEventListener("click", async () => {
        if (confirm("Confirm discovery fee payment for this provider?")) {
            await handleStatusUpdate(providerId, { paymentStatus: "paid" });
        }
    });

    confirmSubscriptionBtn?.addEventListener("click", async () => {
        const providerName = profileName?.textContent || "this provider";
        if (confirm(`Confirm monthly subscription payment for ${providerName}?`)) {
            try {
                await confirmSubscriptionPayment(providerId);
                alert("Subscription payment confirmed successfully!");
                location.reload();
            } catch (error) {
                alert("Error confirmation subscription: " + error.message);
            }
        }
    });

    const loadMoreBtn = document.getElementById("loadMoreReviewsBtn");
    loadMoreBtn?.addEventListener("click", async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<i class="spinner" style="width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; vertical-align: middle; margin-right: 4px;"></i> Loading...';

        await fetchAndRenderReviews(providerId);

        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = `
            <i data-lucide="chevron-down" style="width: 16px; height: 16px;"></i>
            View More Reviews
        `;
        if (window.lucide) window.lucide.createIcons();
    });

    // --- Activation Modal Logic ---
    const activationModal = document.getElementById('activationModal');
    const confirmActivationBtn = document.getElementById('confirmActivationBtn');
    const cancelActivation = document.getElementById('cancelActivation');
    const closeActivation = document.getElementById('closeActivation');

    const closeActivationModal = () => {
        if (activationModal) activationModal.style.display = 'none';
    };

    [cancelActivation, closeActivation].forEach(btn => {
        btn?.addEventListener('click', closeActivationModal);
    });

    confirmActivationBtn?.addEventListener('click', async () => {
        confirmActivationBtn.disabled = true;
        confirmActivationBtn.innerHTML = '<i class="spinner" style="width: 14px; height: 14px; border: 2px solid #fff; border-top-color: transparent; border-radius: 50%; display: inline-block; animation: spin 1s linear infinite; vertical-align: middle; margin-right: 4px;"></i> Activating...';

        try {
            await handleStatusUpdate(providerId, {
                status: "active",
                verified: true
            }, "Provider Activated Successfully", "This provider is now live on the public platform.");
            closeActivationModal();
        } catch (error) {
            confirmActivationBtn.disabled = false;
            confirmActivationBtn.textContent = 'Activate Provider';
        }
    });

    // --- Success Modal Logic ---
    document.getElementById("dismissSuccess")?.addEventListener("click", () => {
        document.getElementById("successModal").style.display = "none";
        location.reload();
    });
}

async function handleStatusUpdate(id, updates, title = "Update Success", message = "Provider information has been updated.") {
    try {
        await updateProviderStatus(id, updates);
        showSuccessModal(title, message);
    } catch (error) {
        alert("Error updating provider: " + error.message);
    }
}

function showSuccessModal(title, message) {
    const modal = document.getElementById("successModal");
    const titleEl = document.getElementById("successTitle");
    const msgEl = document.getElementById("successMessage");

    if (modal && titleEl && msgEl) {
        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = "flex";
        if (window.lucide) window.lucide.createIcons();
    } else {
        // Fallback if modal is missing (e.g. other pages)
        alert(message);
        location.reload();
    }
}

// --- Zoom Logic ---
window.openZoom = (url, label = 'Document') => {
    const modal = document.getElementById("zoomModal");
    const img = document.getElementById("zoomedImg");
    const pdf = document.getElementById("zoomedPdf");

    if (modal && img && pdf) {
        const isPdf = typeof url === 'string' && (
            url.toLowerCase().split('?')[0].endsWith('.pdf') ||
            url.includes('format=pdf') ||
            url.includes('/pdf') ||
            url.includes('google-apps.pdf')
        );

        if (isPdf) {
            pdf.src = url;
            pdf.style.display = "block";
            img.style.display = "none";

            // Add a temporary helper link if not already present
            let downloadLink = document.getElementById('zoom-download-link');
            if (!downloadLink) {
                downloadLink = document.createElement('a');
                downloadLink.id = 'zoom-download-link';
                downloadLink.style.cssText = "position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); color: white; text-decoration: underline; font-size: 0.875rem;";
                document.querySelector('.zoom-content').appendChild(downloadLink);
            }
            downloadLink.href = url;
            downloadLink.target = "_blank";
            downloadLink.textContent = `Open Full ${label} in New Tab`;
            downloadLink.style.display = "block";
        } else {
            img.src = url;
            img.style.display = "block";
            pdf.style.display = "none";
            const downloadLink = document.getElementById('zoom-download-link');
            if (downloadLink) downloadLink.style.display = "none";
        }

        modal.style.display = "flex";
    }
};

document.getElementById("closeZoom")?.addEventListener("click", () => {
    document.getElementById("zoomModal").style.display = "none";
});

// --- Helper Functions ---
/**
 * Safely converts any timestamp (Firestore, object, string, or Date) to a JS Date object
 */
function ensureDate(timestamp) {
    if (!timestamp) return null;
    if (timestamp instanceof Date) return timestamp;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a phone number for WhatsApp wa.me links
 */
function formatWhatsAppLink(phone) {
    if (!phone) return "#";
    // Strip everything except digits
    let cleaned = phone.toString().replace(/\D/g, '');

    // South Africa specific handling: replace leading 0 with 27
    if (cleaned.startsWith('0') && cleaned.length === 10) {
        cleaned = '27' + cleaned.substring(1);
    }

    // If it's a 9 digit number, assume it's missing the leading 0/27
    if (cleaned.length === 9) {
        cleaned = '27' + cleaned;
    }

    return `https://wa.me/${cleaned}`;
}

function formatDate(timestamp) {
    const date = ensureDate(timestamp);
    if (!date) return 'N/A';

    return date.toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function getArea(provider) {
    const areaRaw = provider.areas || provider.areaCovered || provider.serviceArea || provider.area || provider.location || provider.serviceAreas;
    if (!areaRaw) return 'N/A';
    if (Array.isArray(areaRaw)) return areaRaw.join(', ');
    return areaRaw;
}

function getSource(provider) {
    const rawSource = provider.registrationSource || {};
    return {
        type: rawSource.type || rawSource.sourceType || provider.referralSource || provider.sourceType || provider.source || 'Other',
        referredName: rawSource.referredName || rawSource.referralName || provider.referrerName || provider.referralName || provider.referral || 'Unknown'
    };
}

function getReviewerName(review) {
    return review.user ||
        review.userName ||
        review.displayName ||
        review.fullName ||
        review.name ||
        review.user_name ||
        "Anonymous User";
}

function getSubscriptionStatus(provider) {
    const endDate = ensureDate(provider.subscriptionEndDate);
    if (!endDate) return 'Expired'; // No date means expired or not yet active

    const now = new Date();
    const graceDate = ensureDate(provider.gracePeriodEndDate);

    if (now < endDate) return 'Active';
    if (graceDate && now <= graceDate) return 'Grace';
    return 'Expired';
}

function renderComplianceExpiries(provider) {
    const section = document.getElementById("compliance-section");
    const list = document.getElementById("compliance-expiries-list");
    if (!section || !list) return;

    const docs = provider.documents || {};
    const expiries = [
        { label: 'Roadworthy Cert', date: docs.roadworthyExpiry },
        { label: 'PrDP Permit', date: docs.prdpExpiry }
    ];

    const now = new Date();
    let hasExpiries = false;

    const html = expiries.map(item => {
        const expDate = ensureDate(item.date);
        if (!expDate) return '';

        hasExpiries = true;
        const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

        let statusClass = 'badge-active'; // Green (> 30 days)
        let warningText = `${diffDays} days remaining`;

        if (diffDays <= 0) {
            statusClass = 'badge-rejected'; // Red (Expired)
            warningText = `EXPIRED (${Math.abs(diffDays)} days ago)`;
        } else if (diffDays <= 30) {
            statusClass = 'badge-warning'; // Orange (< 30 days)
            warningText = `${diffDays} days left (Renew Soon)`;
        }

        return `
            <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px dashed var(--border-color);">
                <div style="font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.25rem;">${item.label}</div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.875rem; font-weight: 500;">${formatDate(expDate)}</span>
                    <span class="badge ${statusClass}" style="font-size: 0.7rem;">${warningText.toUpperCase()}</span>
                </div>
            </div>
        `;
    }).join('');

    if (hasExpiries) {
        list.innerHTML = html;
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

function renderSubscriptionData(provider) {
    const section = document.getElementById("subscription-section");
    const statusVal = document.getElementById("val-sub-status");
    const startVal = document.getElementById("val-sub-start");
    const endVal = document.getElementById("val-sub-end");
    const lastVal = document.getElementById("val-sub-last");
    const btn = document.getElementById("confirmSubscriptionBtn");

    if (!section) return;

    const status = getSubscriptionStatus(provider);

    // Status Badge Color
    let statusClass = 'badge-pending'; // Default for Expired/N/A
    if (status === 'Active') statusClass = 'badge-active';
    if (status === 'Grace') statusClass = 'badge-warning';

    if (statusVal) {
        statusVal.innerHTML = `<span class="badge ${statusClass}">${status.toUpperCase()}</span>`;
    }

    if (startVal) startVal.textContent = formatDate(provider.subscriptionStartDate);
    if (endVal) endVal.textContent = formatDate(provider.subscriptionEndDate);
    if (lastVal) lastVal.textContent = formatDate(provider.lastPaymentDate);

    // Button Visibility: Only show if Expired, Grace, or No subscription exists
    if (btn) {
        btn.style.display = (status === 'Expired' || status === 'Grace') ? 'flex' : 'none';
    }
}

function updateStat(id, value) {
    // ... same ...
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function renderProviderTable(providers, emptyMessage = "No providers found.") {
    if (!providerTableBody) return;

    if (providers.length === 0) {
        providerTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <i data-lucide="search-x" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                        <p>${emptyMessage}</p>
                    </div>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    providerTableBody.innerHTML = providers.map(provider => {
        // Use helpers for robust data mapping
        const name = provider.fullName || provider.name || provider.businessName || 'N/A';
        const area = getArea(provider);
        const sourceData = getSource(provider);

        return `
            <tr>
                <td style="font-weight: 500;">${name}</td>
                <td>${area}</td>
                <td>${renderSourceBadge(sourceData)}</td>
                <td>${renderPaymentBadge(provider.paymentStatus)}</td>
                <td>${renderStatusBadge(provider.status)}</td>
                <td>
                    <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; width: auto;" onclick="viewProfile('${provider.id}')">
                        Review
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderPaymentTable(providers, paymentType = 'reg', emptyMessage = "No payment records found.") {
    if (!providerTableBody) return;

    // Filter providers based on payment type
    let filtered = providers;
    if (paymentType === 'reg') {
        // Show all but prioritize those needing registration approval
    } else if (paymentType === 'sub') {
        // Only show those with an existing subscription record or active account
        filtered = providers.filter(p => p.status === 'active' || p.subscriptionEndDate);
    }

    if (filtered.length === 0) {
        providerTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                        <i data-lucide="search-x" style="width: 48px; height: 48px; opacity: 0.5;"></i>
                        <p>${emptyMessage}</p>
                    </div>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    providerTableBody.innerHTML = filtered.map(p => {
        const name = p.fullName || p.name || p.businessName || 'N/A';

        if (paymentType === 'sub') {
            const subStatus = getSubscriptionStatus(p);
            let statusClass = 'badge-pending';
            if (subStatus === 'Active') statusClass = 'badge-active';
            if (subStatus === 'Grace') statusClass = 'badge-warning';

            return `
                <tr style="cursor: pointer;" onclick="viewProfile('${p.id}')">
                    <td style="font-weight: 500;">${name}</td>
                    <td>${formatDate(p.subscriptionEndDate)}</td>
                    <td><span class="badge ${statusClass}">${subStatus.toUpperCase()}</span></td>
                    <td>${formatDate(p.lastPaymentDate)}</td>
                    <td><span class="badge badge-info" style="font-size: 0.7rem;">MONTHLY</span></td>
                    <td>
                        <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; width: auto;">
                            Review
                        </button>
                    </td>
                </tr>
            `;
        } else {
            const phone = p.phoneNumber || p.phone || 'N/A';
            const type = "Registration";
            const amount = "R99";

            return `
                <tr style="cursor: pointer;" onclick="viewProfile('${p.id}')">
                    <td style="font-weight: 500;">${name}</td>
                    <td style="color: var(--text-muted);">${phone}</td>
                    <td><span class="badge badge-info" style="font-size: 0.7rem; font-weight: 600;">${type}</span></td>
                    <td style="font-weight: 700;">${p.amountPaid || amount}</td>
                    <td>${renderPaymentBadge(p.paymentStatus)}</td>
                    <td>
                        <button class="btn-primary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; width: auto;">
                            Review
                        </button>
                    </td>
                </tr>
            `;
        }
    }).join('');
}

function renderSourceBadge(source) {
    if (!source) return `<span class="badge badge-info">Other</span>`;

    // Handle both object { type, referralName } and simple string
    const type = typeof source === 'object' ? (source.type || source.sourceType || source.referralSource) : source;
    const referralName = typeof source === 'object' ? (source.referredName || source.referrerName || source.referralName || source.referral) : null;

    const label = (type === 'Referral' || type === 'friend') ? `Referral: ${referralName || 'Unknown'}` : type;
    return `<span class="badge badge-info">${label}</span>`;
}

function renderStatusBadge(status) {
    const s = status || 'pending';
    const statusClass = `badge-${s}`;
    return `<span class="badge ${statusClass}">${s.toUpperCase()}</span>`;
}

function renderPaymentBadge(status) {
    const isPaid = status === 'paid';
    return `<span class="badge ${isPaid ? 'badge-active' : 'badge-pending'}">${isPaid ? 'PAID' : 'UNPAID'}</span>`;
}

function renderAvailabilityBadge(status) {
    const s = (status || 'available').toLowerCase();
    const label = s === 'full' || s === 'fully booked' ? 'FULLY BOOKED' : 'AVAILABLE';
    const statusClass = s === 'full' || s === 'fully booked' ? 'badge-rejected' : 'badge-active';

    return `<span class="badge ${statusClass}">
        <i data-lucide="${s === 'full' || s === 'fully booked' ? 'users' : 'check'}" style="width: 12px; height: 12px; margin-right: 4px;"></i>
        ${label}
    </span>`;
}

// --- Auth Handlers ---
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        loginBtn.disabled = true;
        loginBtn.textContent = "Authenticating...";
        loginError.classList.add("hidden");

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;

        try {
            await login(email, password);
            window.location.href = "dashboard.html";
        } catch (error) {
            console.error(error);
            loginError.classList.remove("hidden");
            loginError.textContent = error.message;
            loginBtn.disabled = false;
            loginBtn.textContent = "Login to Dashboard";
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
        e.preventDefault();
        logout();
    });
}

window.viewProfile = (id) => {
    window.location.href = `provider-profile.html?id=${id}`;
};

