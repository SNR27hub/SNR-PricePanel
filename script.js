import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, arrayUnion, setDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBMELq2g9Yq7BfZKeRSlhaX8uw42rpu31Q", // SECURITY RISK: Change this key!
    authDomain: "snr-pricepanel.firebaseapp.com",
    projectId: "snr-pricepanel",
    storageBucket: "snr-pricepanel.appspot.com",
    messagingSenderId: "316094636207",
    appId: "1:316094636207:web:a91fdcd695904edf3ab45a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const projectsCollection = collection(db, 'projects');
const settingsCollection = collection(db, 'settings');
const appConfigDocRef = doc(settingsCollection, 'appConfig');

// --- Global Constants ---
let ADMIN_UPI_NUMBER = "Loading..."; 
const MARKET_PRICE_MULTIPLIER = 2.5; // Market Price = Developer Price * 2.5

const DEFAULT_SERVICES = [
    "UI/UX Design",
    "Frontend Development",
    "Backend Development (API)",
    "Database Setup (Firebase/MySQL)",
    "Payment Gateway Integration",
    "Authentication (Login, OTP, etc.)",
    "Admin Panel Development",
    "Deployment (Play Store / Hosting)",
    "1 Year Maintenance"
];

// --- DOM Elements & Router ---
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('admin-dashboard-view'),
    client: document.getElementById('client-view')
};
const loginButton = document.getElementById('login-button');
const servicesContainer = document.getElementById('services-container');
const projectForm = document.getElementById('project-form');
const discountReasonInput = document.getElementById('discount-reason');

// Global Settings Elements
const upiNumberInput = document.getElementById('upi-number-input');
const saveUpiBtn = document.getElementById('save-upi-btn');
const upiSaveStatus = document.getElementById('upi-save-status');

// Calculated Total Price Display (Admin Form)
const calculatedMarketTotalSpan = document.getElementById('calculated-market-total');
const calculatedDevTotalSpan = document.getElementById('calculated-dev-total');

// Final Pricing Inputs (Admin Form)
const marketDiscountPercentInput = document.getElementById('market-discount-percent-input');
const finalDeveloperPriceInput = document.getElementById('final-developer-price-input');

// Modal Elements
const credentialsModalOverlay = document.getElementById('create-credentials-modal-overlay');
const credentialsForm = document.getElementById('create-credentials-form');
const modalProjectName = document.getElementById('modal-project-name');
const modalClientEmail = document.getElementById('modal-client-email');
const credentialsEmailInput = document.getElementById('credentials-email');
const credentialsPasswordInput = document.getElementById('credentials-password');
const credentialsErrorEl = document.getElementById('credentials-error');
const cancelCredentialsBtn = document.getElementById('cancel-credentials-btn');

let currentVerifyProjectId = null;
let currentVerifyPaymentId = null;


const showView = (viewName) => {
    Object.values(views).forEach(view => view.style.display = 'none');
    if (views[viewName]) views[viewName].style.display = 'block';
};

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('id');

        if (projectId) {
            showView('client');
            loadClientView(projectId);
        } else if (user) {
            showView('dashboard');
            fetchUpiNumber(); 
            fetchProjects();
            populateAdminServices(true); 
            // Calculated totals will update automatically from populateAdminServices
        } else {
            showView('login');
        }
    });
    setupEventListeners();
});

// --- Event Listeners ---
const setupEventListeners = () => {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    projectForm.addEventListener('submit', handleProjectSave);
    document.getElementById('project-list').addEventListener('click', handleAdminProjectActions);
    document.getElementById('cancel-edit-btn').addEventListener('click', resetProjectForm);
    
    // Individual service price change
    servicesContainer.addEventListener('input', (e) => {
        if (e.target.classList.contains('service-dev-price')) {
            updateMarketPrice(e.target);
            updateCalculatedTotalsDisplay(); // Update calculated totals when individual price changes
        }
    });

    // Global Settings Event Listener
    saveUpiBtn.addEventListener('click', saveUpiNumber);
    upiNumberInput.addEventListener('input', () => upiSaveStatus.textContent = ''); 

    // Modal event listeners
    credentialsForm.addEventListener('submit', handleCredentialSubmission);
    cancelCredentialsBtn.addEventListener('click', () => {
        credentialsModalOverlay.style.display = 'none';
        credentialsForm.reset();
        credentialsErrorEl.textContent = '';
    });
};

// --- Login Logic ---
const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    loginButton.disabled = true;
    loginButton.textContent = 'Logging in...';
    errorEl.textContent = '';
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        errorEl.textContent = "Invalid email or password.";
    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'Login';
    }
};

// --- Global Settings Logic ---
const fetchUpiNumber = async () => {
    try {
        const docSnap = await getDoc(appConfigDocRef);
        if (docSnap.exists() && docSnap.data().upiNumber) {
            ADMIN_UPI_NUMBER = docSnap.data().upiNumber;
            upiNumberInput.value = ADMIN_UPI_NUMBER;
        } else {
            // Set default if not found in Firestore, and let admin save it
            ADMIN_UPI_NUMBER = upiNumberInput.value; 
            console.log("UPI number not found in Firestore. Using default from HTML input.");
            // Optionally, save this default to Firestore automatically if you want
            // await setDoc(appConfigDocRef, { upiNumber: ADMIN_UPI_NUMBER }, { merge: true });
        }
    } catch (error) {
        console.error("Error fetching UPI number:", error);
        ADMIN_UPI_NUMBER = upiNumberInput.value; 
        upiSaveStatus.textContent = "Error fetching UPI. Using default. Please save.";
        upiSaveStatus.style.color = "var(--danger-color)";
    }
};

const saveUpiNumber = async () => {
    const newUpiNumber = upiNumberInput.value.trim();
    if (!newUpiNumber) {
        upiSaveStatus.textContent = "UPI number cannot be empty.";
        upiSaveStatus.style.color = "var(--danger-color)";
        return;
    }
    saveUpiBtn.disabled = true;
    upiSaveStatus.textContent = "Saving...";
    upiSaveStatus.style.color = "var(--warning-color)";

    try {
        await setDoc(appConfigDocRef, { upiNumber: newUpiNumber }, { merge: true });
        ADMIN_UPI_NUMBER = newUpiNumber; 
        upiSaveStatus.textContent = "UPI number saved successfully!";
        upiSaveStatus.style.color = "var(--success-color)";
    } catch (error) {
        console.error("Error saving UPI number:", error);
        upiSaveStatus.textContent = "Error saving UPI number. Please try again.";
        upiSaveStatus.style.color = "var(--danger-color)";
    } finally {
        saveUpiBtn.disabled = false;
    }
};


// --- Client View Logic ---
const loadClientView = async (projectId) => {
    const container = views.client;
    container.innerHTML = '<div class="loader"></div>';
    const docRef = doc(db, 'projects', projectId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const project = docSnap.data();
        
        // Retrieve saved totals for display
        const originalMarketTotal = Number(project.calculatedOriginalMarketTotal) || 0;
        const marketDiscountPercent = Number(project.marketDiscountPercent) || 0;
        const clientDisplayDiscountedMarketPrice = Number(project.clientDisplayDiscountedMarketPrice) || 0; // This is the final market price after discount
        const clientPayableDeveloperPrice = Number(project.clientPayableDeveloperPrice) || 0; // This is the final amount client pays

        const servicesRows = project.services.map(service => {
            return `
                <tr>
                    <td>${service.name}</td>
                    <td class="market-price">₹${Number(service.marketPrice).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                    <td class="dev-price">₹${Number(service.devPrice).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                </tr>
            `;
        }).join('');

        const pendingPayment = (project.payments || []).find(p => p.status === 'pending');
        const verifiedPayment = (project.payments || []).find(p => p.status === 'verified');

        let paymentSection = '';
        if (verifiedPayment) {
            paymentSection = `
                <div class="credentials-display card">
                    <h3>✅ Payment Verified! Here are your Admin Panel Credentials:</h3>
                    <p><strong>Username/Email:</strong> <span>${verifiedPayment.generatedUsername}</span></p>
                    <p><strong>Password:</strong> <span>${verifiedPayment.generatedPassword}</span></p>
                    <p style="margin-top:15px; font-size:0.9em;">(Please save these securely. You can change your password after logging in.)</p>
                </div>
            `;
        } else if (pendingPayment) {
            paymentSection = `
                <div class="payment-instructions card">
                    <h3>Payment Pending Verification</h3>
                    <p>We have received your UTR for ${pendingPayment.clientEmail}. Your payment is currently under review by our admin.</p>
                    <p>We will issue your Admin Panel credentials shortly after verification.</p>
                    <p style="margin-top:15px; font-size:0.9em;">(This page will update automatically once verified.)</p>
                </div>
            `;
        } else {
            await fetchUpiNumber(); // Ensure UPI number is fetched for client display
            paymentSection = `
                <div class="payment-instructions card">
                    <h3>You Only Pay The Developer Price!</h3>
                    <p>Complete your payment to the UPI ID / PhonePe number below.</p>
                    <strong>${ADMIN_UPI_NUMBER}</strong>
                </div>
                <div id="utr-form-section" class="card">
                    <h3>Confirm Your Payment</h3>
                    <form id="utr-form">
                        <input type="email" id="client-email-utr" placeholder="Your Email (for credentials)" required>
                        <input type="text" id="utr-number" placeholder="UTR / Transaction ID" required>
                        <button type="submit" class="cta-button">Submit UTR</button>
                        <p id="utr-error" class="error-message"></p>
                    </form>
                </div>
            `;
        }
        
        const totalSavings = clientDisplayDiscountedMarketPrice - clientPayableDeveloperPrice;
        const savingsPercentage = clientDisplayDiscountedMarketPrice > 0 ? ((totalSavings / clientDisplayDiscountedMarketPrice) * 100).toFixed(0) : 0;


        container.innerHTML = `
            <div class="card">
                <h1 class="title">Quotation for ${project.projectName}</h1>
                <p>Hello ${project.clientName}, here is the detailed cost breakdown for your project.</p>
                
                ${project.imageUrl ? `<img src="${project.imageUrl}" alt="${project.projectName}" style="max-width:100%; border-radius:8px; margin-bottom:20px;">` : ''}

                <div class="reason-box">Why Developer Price is Lower: <strong>${project.discountReason || 'Special Offer!'}</strong></div>

                <table class="pricing-table">
                    <thead><tr><th>Service / Feature</th><th style="text-align: right;">Market Price</th><th style="text-align: right;">Developer SNR Price</th></tr></thead>
                    <tbody>${servicesRows}</tbody>
                </table>
                <div class="totals-section">
                    <p>Total Market Price (Original): <span class="total-market-price-display">~₹${originalMarketTotal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></p>
                    <p>Market Discount Applied: <span class="discount-percent-display">${marketDiscountPercent}%</span></p>
                    <p>Final Market Price: <span class="total-market-price-display">~₹${clientDisplayDiscountedMarketPrice.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></p>
                    <p>Total Developer Price: <span class="final-price-emphasis">₹${clientPayableDeveloperPrice.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></p>
                </div>
                <div class="you-save-box">
                    You save ₹${totalSavings.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} (${savingsPercentage}%) by choosing SNR!
                </div>
            </div>
            ${paymentSection}
        `;

        if (!verifiedPayment && !pendingPayment) {
            document.getElementById('utr-form').addEventListener('submit', (e) => handleUtrSubmission(e, projectId));
        }

    } else {
        container.innerHTML = `<h2 class="title error-message">Error: Project not found.</h2>`;
    }
};

const handleUtrSubmission = async (e, projectId) => {
    e.preventDefault();
    const clientEmail = document.getElementById('client-email-utr').value;
    const utrNumber = document.getElementById('utr-number').value;
    const utrErrorEl = document.getElementById('utr-error');
    utrErrorEl.textContent = '';

    if (!clientEmail || !utrNumber) {
        utrErrorEl.textContent = "Please fill in all fields.";
        return;
    }

    try {
        const projectRef = doc(db, 'projects', projectId);
        await updateDoc(projectRef, {
            payments: arrayUnion({
                id: Date.now().toString(), 
                clientEmail: clientEmail,
                utr: utrNumber,
                status: 'pending',
                timestamp: serverTimestamp()
            })
        });
        alert('UTR submitted successfully! Your payment is pending verification.');
        loadClientView(projectId); 
    } catch (error) {
        console.error("Error submitting UTR:", error);
        utrErrorEl.textContent = "Error submitting UTR. Please try again.";
    }
};

// --- Admin Dashboard Logic ---
const populateAdminServices = (isNewProject = false, projectServices = []) => {
    servicesContainer.innerHTML = '';
    const servicesToLoad = projectServices.length > 0 ? projectServices : DEFAULT_SERVICES.map(name => ({ name: name, marketPrice: '', devPrice: '' }));

    servicesToLoad.forEach(service => {
        addServiceRowToAdminForm(service);
    });
    updateCalculatedTotalsDisplay(); // Update calculated totals after populating
};

const addServiceRowToAdminForm = (service = { name: '', marketPrice: '', devPrice: '' }) => {
    const div = document.createElement('div');
    div.className = 'service-item';
    div.innerHTML = `
        <input type="text" class="service-name" placeholder="Service Name" value="${service.name}" required>
        <div class="market-price-display" data-market-price="${service.marketPrice}">
            ${service.marketPrice ? '₹' + Number(service.marketPrice).toFixed(0).toLocaleString('en-IN') : 'Auto-Calc'}
        </div>
        <input type="number" class="service-dev-price" placeholder="Dev ₹" value="${service.devPrice}" required>
    `;
    servicesContainer.appendChild(div);

    if (service.devPrice) { // Auto-calculate market price on load
        const devPriceInput = div.querySelector('.service-dev-price');
        updateMarketPrice(devPriceInput);
    } else if (service.marketPrice) { // If only market price is loaded, display it
        const marketPriceDisplay = div.querySelector('.market-price-display');
        marketPriceDisplay.textContent = '₹' + Number(service.marketPrice).toFixed(0).toLocaleString('en-IN');
        marketPriceDisplay.dataset.marketPrice = Number(service.marketPrice).toFixed(0);
    }
};

const updateMarketPrice = (devPriceInput) => {
    const devPrice = Number(devPriceInput.value);
    const marketPriceDisplay = devPriceInput.previousElementSibling;
    if (devPrice > 0) {
        const calculatedMarketPrice = devPrice * MARKET_PRICE_MULTIPLIER;
        marketPriceDisplay.textContent = '₹' + calculatedMarketPrice.toFixed(0).toLocaleString('en-IN');
        marketPriceDisplay.dataset.marketPrice = calculatedMarketPrice.toFixed(0);
    } else {
        marketPriceDisplay.textContent = 'Auto-Calc';
        marketPriceDisplay.dataset.marketPrice = '';
    }
};

// Calculates sum of individual service prices
const calculateServiceTotals = () => {
    let totalMarket = 0;
    let totalDev = 0;
    document.querySelectorAll('.service-item').forEach(item => {
        totalMarket += Number(item.querySelector('.market-price-display').dataset.marketPrice) || 0;
        totalDev += Number(item.querySelector('.service-dev-price').value) || 0;
    });
    return { totalMarket, totalDev };
};

// Updates the two main calculated total display spans in the admin form
const updateCalculatedTotalsDisplay = () => {
    const { totalMarket, totalDev } = calculateServiceTotals();
    calculatedMarketTotalSpan.textContent = `₹${totalMarket.toFixed(0).toLocaleString('en-IN')}`;
    calculatedDevTotalSpan.textContent = `₹${totalDev.toFixed(0).toLocaleString('en-IN')}`;
};


const handleProjectSave = async (e) => {
    e.preventDefault();
    const services = Array.from(document.querySelectorAll('.service-item')).map(item => ({
        name: item.querySelector('.service-name').value,
        marketPrice: Number(item.querySelector('.market-price-display').dataset.marketPrice),
        devPrice: Number(item.querySelector('.service-dev-price').value)
    }));

    if (services.some(s => !s.name || s.devPrice <= 0 || isNaN(s.devPrice) || !s.marketPrice || isNaN(s.marketPrice) || s.marketPrice <= 0)) {
        alert("Please ensure all service names and valid Developer Prices are entered. Market price will auto-calculate.");
        return;
    }
    if (!discountReasonInput.value.trim()) {
        alert("Please enter a reason for the developer discount.");
        return;
    }

    const marketDiscountPercent = Number(marketDiscountPercentInput.value) || 0; // Default to 0 if empty/invalid
    const clientSetFinalDeveloperPrice = Number(finalDeveloperPriceInput.value); // This is what the admin *wants* client to pay

    // --- VALIDATION ---
    if (isNaN(clientSetFinalDeveloperPrice) || clientSetFinalDeveloperPrice <= 0) {
        alert("Please enter a valid Final Price Client Pays (must be greater than 0).");
        return;
    }
    if (marketDiscountPercent < 0 || marketDiscountPercent > 100) {
        alert("Market Discount % must be between 0 and 100.");
        return;
    }

    // Calculate the original market total from individual services
    const calculatedOriginalMarketTotal = services.reduce((sum, s) => sum + s.marketPrice, 0);

    // Calculate the final market price after applying discount (for client comparison)
    const clientDisplayDiscountedMarketPrice = calculatedOriginalMarketTotal * (1 - marketDiscountPercent / 100);

    if (clientSetFinalDeveloperPrice >= clientDisplayDiscountedMarketPrice) {
        alert(`Final Price Client Pays (₹${clientSetFinalDeveloperPrice.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}) must be less than the Discounted Market Price (₹${clientDisplayDiscountedMarketPrice.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}) for a valid comparison.`);
        return;
    }
    // --- END VALIDATION ---

    const projectData = {
        clientName: document.getElementById('client-name').value,
        projectName: document.getElementById('project-name').value,
        imageUrl: document.getElementById('image-url').value,
        discountReason: discountReasonInput.value.trim(),
        services: services,
        calculatedOriginalMarketTotal: calculatedOriginalMarketTotal, // Save for client display original
        marketDiscountPercent: marketDiscountPercent,
        clientDisplayDiscountedMarketPrice: clientDisplayDiscountedMarketPrice, // Save for client display after discount
        clientPayableDeveloperPrice: clientSetFinalDeveloperPrice, // Save the exact amount client pays
        payments: []
    };

    const id = document.getElementById('project-id').value;
    if (id) {
        const existingDoc = await getDoc(doc(db, 'projects', id));
        if (existingDoc.exists()) {
            projectData.payments = existingDoc.data().payments || [];
        }
        await updateDoc(doc(db, 'projects', id), projectData);
    } else {
        projectData.createdAt = serverTimestamp();
        await addDoc(projectsCollection, projectData);
    }
    resetProjectForm();
    fetchProjects();
};

const handleAdminProjectActions = async (e) => {
    const button = e.target.closest('button');
    if (!button) return;
    const id = button.dataset.id; 

    if (button.classList.contains('delete-btn')) {
        if (confirm('Delete this project?')) {
            await deleteDoc(doc(db, 'projects', id));
            fetchProjects();
        }
    } else if (button.classList.contains('edit-btn')) {
        const docRef = doc(db, 'projects', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const project = docSnap.data();
            resetProjectForm();
            document.getElementById('project-id').value = docSnap.id;
            document.getElementById('client-name').value = project.clientName;
            document.getElementById('project-name').value = project.projectName;
            document.getElementById('image-url').value = project.imageUrl || '';
            discountReasonInput.value = project.discountReason || ''; 
            
            populateAdminServices(false, project.services); // Populate individual services

            marketDiscountPercentInput.value = project.marketDiscountPercent || ''; // Load market discount %
            finalDeveloperPriceInput.value = project.clientPayableDeveloperPrice || ''; // Load final developer price

            // Calculated totals will update from populateAdminServices
            // No need to set totalMarketPriceInput/totalDevPriceInput as they are now display-only in this version.
            
            document.getElementById('form-title').textContent = 'Edit Project';
            document.getElementById('cancel-edit-btn').style.display = 'block';
            window.scrollTo(0, 0);
        }
    } else if (button.classList.contains('verify-payment-btn')) {
        const paymentId = button.dataset.paymentId;
        currentVerifyProjectId = id;
        currentVerifyPaymentId = paymentId;

        const projectRef = doc(db, 'projects', id);
        const docSnap = await getDoc(projectRef);
        if (docSnap.exists()) {
            const project = docSnap.data();
            const payment = (project.payments || []).find(p => p.id === paymentId);
            if (payment) {
                modalProjectName.textContent = project.projectName;
                modalClientEmail.textContent = payment.clientEmail;
                credentialsEmailInput.value = payment.clientEmail; 
                credentialsPasswordInput.value = ''; 
            }
        }
        credentialsErrorEl.textContent = '';
        credentialsModalOverlay.style.display = 'flex'; 
    }
};

const handleCredentialSubmission = async (e) => {
    e.preventDefault();
    const generatedUsername = credentialsEmailInput.value.trim();
    const generatedPassword = credentialsPasswordInput.value.trim();

    if (!generatedUsername || !generatedPassword) {
        credentialsErrorEl.textContent = "Please enter both username and password.";
        return;
    }

    try {
        const projectRef = doc(db, 'projects', currentVerifyProjectId);
        const docSnap = await getDoc(projectRef);

        if (docSnap.exists()) {
            const project = docSnap.data();
            const updatedPayments = (project.payments || []).map(p => {
                if (p.id === currentVerifyPaymentId) {
                    return { ...p, status: 'verified', verificationTimestamp: serverTimestamp(), generatedUsername, generatedPassword };
                }
                return p;
            });
            await updateDoc(projectRef, { payments: updatedPayments });
            alert('Payment verified and credentials set!');
            
            credentialsModalOverlay.style.display = 'none'; 
            credentialsForm.reset();
            credentialsErrorEl.textContent = '';
            currentVerifyProjectId = null;
            currentVerifyPaymentId = null;

            fetchProjects(); 
        }
    } catch (error) {
        console.error("Error setting credentials:", error);
        credentialsErrorEl.textContent = "Error setting credentials. Please try again.";
    }
};


const resetProjectForm = () => {
    document.getElementById('project-form').reset();
    document.getElementById('project-id').value = '';
    discountReasonInput.value = ''; 
    populateAdminServices(true); // Re-populate with default services
    marketDiscountPercentInput.value = ''; // Clear market discount
    finalDeveloperPriceInput.value = ''; // Clear final developer price
    document.getElementById('form-title').textContent = 'Add New Project Quotation';
    document.getElementById('cancel-edit-btn').style.display = 'none';
    updateCalculatedTotalsDisplay(); // Reset calculated totals
};

const fetchProjects = async () => {
    const listEl = document.getElementById('project-list');
    listEl.innerHTML = '<div class="loader"></div>';
    const q = query(projectsCollection, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    listEl.innerHTML = '';
    if (snapshot.empty) {
        listEl.innerHTML = '<p style="text-align:center;">No projects found. Add one above!</p>';
        return;
    }

    snapshot.forEach(doc => {
        const project = doc.data();
        const paymentLink = `${window.location.href.split('?')[0]}?id=${doc.id}`;

        const pendingPayments = (project.payments || []).filter(p => p.status === 'pending');
        const verifiedPayments = (project.payments || []).filter(p => p.status === 'verified');

        let paymentsSectionHTML = '';
        if (pendingPayments.length > 0 || verifiedPayments.length > 0) {
            paymentsSectionHTML = `
                <div class="pending-payments-section">
                    <h4>Payment Requests:</h4>
                    ${pendingPayments.map(p => `
                        <div class="payment-request-item">
                            <span>Email: <strong>${p.clientEmail}</strong> | UTR: <strong>${p.utr}</strong> | Status: Pending</span>
                            <button class="verify-payment-btn" data-id="${doc.id}" data-payment-id="${p.id}"><i class="fas fa-check"></i> Verify</button>
                        </div>
                    `).join('')}
                     ${verifiedPayments.map(p => `
                        <div class="payment-request-item">
                            <span>Email: <strong>${p.clientEmail}</strong> | Status: <span class="verified-status">Verified!</span></span>
                            <span>(User: ${p.generatedUsername})</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        listEl.innerHTML += `
            <div class="project-item card">
                <div class="project-header">
                    <strong>${project.projectName}</strong> (for ${project.clientName})
                    <div class="project-actions">
                        <button class="edit-btn" data-id="${doc.id}"><i class="fas fa-edit"></i> Edit</button>
                        <button class="delete-btn" data-id="${doc.id}"><i class="fas fa-trash-alt"></i> Delete</button>
                    </div>
                </div>
                <div class="project-item-info">
                    <small>Client Link:</small>
                    <input type="text" value="${paymentLink}" readonly onclick="this.select()">
                </div>
                ${paymentsSectionHTML}
            </div>`;
    });
};
