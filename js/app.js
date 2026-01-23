// Main Application Controller
import { login, logout, initAuthGuard } from "./auth.js";
import { getDashboardMetrics, getRecentProviders, getProviderById, updateProviderStatus } from "./firestore.js";

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
        { id: 'filter-payments', status: null, title: 'Payments', tableTitle: 'Financial Overview', isPayments: true }
    ];

    filters.forEach(filter => {
        const btn = document.getElementById(filter.id);
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();

                // Update UI State
                document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
                btn.classList.add('active');

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
                updateTableHeader(isPaymentView);

                // Show loading state in table
                if (providerTableBody) {
                    providerTableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">Loading data...</td></tr>';
                }

                // Fetch and render
                allProviders = await getRecentProviders(filter.isPayments ? 100 : 20, filter.status);

                if (isPaymentView) {
                    renderPaymentTable(allProviders);
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

function updateTableHeader(isPayments) {
    const tableHead = document.getElementById('tableHead');
    if (!tableHead) return;

    if (isPayments) {
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
        statusBadgeContainer.innerHTML = renderStatusBadge(provider.status);
    }

    // Personal Info
    setVal("val-email", provider.email);
    setVal("val-phone", provider.phoneNumber || provider.phone);
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

    docGrid.innerHTML = Object.entries(docs).map(([key, url]) => {
        const isPdf = typeof url === 'string' && (url.toLowerCase().split('?')[0].endsWith('.pdf') || url.includes('format=pdf') || url.includes('/pdf'));

        return `
            <div class="doc-card">
                <div class="doc-preview ${isPdf ? 'pdf-preview' : ''}" onclick="openZoom('${url}')">
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

function setupProfileActions(providerId) {
    const approveBtn = document.getElementById("approveProviderBtn");
    const rejectBtn = document.getElementById("rejectProviderBtn");
    const confirmPaymentBtn = document.getElementById("confirmPaymentBtn");

    approveBtn?.addEventListener("click", async () => {
        if (confirm("Are you sure you want to ACTIVATE this provider? They will go live on the public site.")) {
            await handleStatusUpdate(providerId, { status: "active" });
        }
    });

    rejectBtn?.addEventListener("click", async () => {
        if (rejectionNote.style.display === "none") {
            rejectionNote.style.display = "block";
            rejectionNote.focus();
            rejectBtn.textContent = "Confirm Rejection";
            return;
        }

        const note = rejectionNote.value.trim();
        if (!note) {
            alert("Please provide a reason for rejection.");
            return;
        }

        if (confirm("Reject this provider?")) {
            await handleStatusUpdate(providerId, {
                status: "rejected",
                rejectionReason: note
            });
        }
    });

    confirmPaymentBtn?.addEventListener("click", async () => {
        if (confirm("Confirm discovery fee payment for this provider?")) {
            await handleStatusUpdate(providerId, { paymentStatus: "paid" });
        }
    });
}

async function handleStatusUpdate(id, updates) {
    try {
        await updateProviderStatus(id, updates);
        alert("Provider updated successfully!");
        location.reload();
    } catch (error) {
        alert("Error updating provider: " + error.message);
    }
}

// --- Zoom Logic ---
window.openZoom = (url) => {
    const modal = document.getElementById("zoomModal");
    const img = document.getElementById("zoomedImg");
    const pdf = document.getElementById("zoomedPdf");

    if (modal && img && pdf) {
        const isPdf = typeof url === 'string' && (url.toLowerCase().split('?')[0].endsWith('.pdf') || url.includes('format=pdf') || url.includes('/pdf'));

        if (isPdf) {
            pdf.src = url;
            pdf.style.display = "block";
            img.style.display = "none";
        } else {
            img.src = url;
            img.style.display = "block";
            pdf.style.display = "none";
        }

        modal.style.display = "flex";
    }
};

document.getElementById("closeZoom")?.addEventListener("click", () => {
    document.getElementById("zoomModal").style.display = "none";
});

// --- Helper Functions ---
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    // Handle Firebase Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // Handle plain object with seconds (Firebase internal structure)
    if (timestamp.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString('en-ZA', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    // Handle string or Date object
    const date = new Date(timestamp);
    return date.toString() !== 'Invalid Date' ? date.toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric'
    }) : 'Invalid Date';
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

function renderPaymentTable(providers, emptyMessage = "No payment records found.") {
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

    providerTableBody.innerHTML = providers.map(p => {
        const name = p.fullName || p.name || p.businessName || 'N/A';
        const phone = p.phoneNumber || p.phone || 'N/A';

        // Logical derivation for demo/first-phase
        const isSubscription = p.status === 'active' && p.paymentStatus === 'paid';
        const type = isSubscription ? "Subscription" : "Registration";
        const amount = isSubscription ? "R49" : "R99";

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

