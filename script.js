// ======================================
// CẤU HÌNH API (Node.js Backend)
// ======================================
let API_BASE = window.location.origin + '/api';
if (window.location.protocol === 'file:') {
    API_BASE = 'http://localhost:3000/api';
}

// ======================================
// CẤU HÌNH EMAILJS
// ======================================
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY_HERE";
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID_HERE";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID_HERE";

if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBLIC_KEY);

// ======================================
// HỆ THỐNG ÂM THANH
// ======================================
let audioContext = null, bellBuffer = null, audioUnlocked = false, alarmInterval = null, isAlarmSilenced = false;

function createBellBuffer(ctx) {
    const sr = ctx.sampleRate, dur = 1.2, len = sr * dur;
    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
        const t = i / sr, env = Math.exp(-2.5 * t);
        data[i] = Math.max(-1, Math.min(1, env * (
            0.6 * Math.sin(2 * Math.PI * 830 * t) + 0.35 * Math.sin(2 * Math.PI * 1660 * t) +
            0.2 * Math.sin(2 * Math.PI * 2490 * t) + 0.1 * Math.sin(2 * Math.PI * 3320 * t)
        )));
    }
    return buffer;
}

function initAudioContext() {
    if (audioContext) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioContext = new AC();
        bellBuffer = createBellBuffer(audioContext);
        audioUnlocked = true;
    } catch (e) { console.error(e); }
}

function playBellOnce() {
    if (!audioContext || !bellBuffer || !audioUnlocked) return;
    if (audioContext.state === 'suspended') audioContext.resume();
    const src = audioContext.createBufferSource(), g = audioContext.createGain();
    src.buffer = bellBuffer; g.gain.value = 0.8;
    src.connect(g); g.connect(audioContext.destination); src.start(0);
}

function startAlarmLoop() {
    if (alarmInterval) return;
    playBellOnce();
    alarmInterval = setInterval(() => { if (!isAlarmSilenced) playBellOnce(); else stopAlarmLoop(); }, 2500);
}

function stopAlarmLoop() { if (alarmInterval) { clearInterval(alarmInterval); alarmInterval = null; } }

document.addEventListener('click', function unlockAudio() {
    initAudioContext();
    if (cachedNotifications.filter(n => !n.isRead).length > 0 && !isAlarmSilenced) startAlarmLoop();
    document.removeEventListener('click', unlockAudio);
}, { once: true });

// ======================================
// CACHE (API → RAM → render nhanh)
// ======================================
let cachedCustomers = [], cachedAdmins = [], cachedNotifications = [];
let currentFilterService = '', currentView = 'home';

// DOM
const tableBody = document.getElementById('tableBody');
const adminTableBody = document.getElementById('adminTableBody');
const searchInput = document.getElementById('searchInput');
const emptyState = document.getElementById('emptyState');
const emptyAdminState = document.getElementById('emptyAdminState');
const customerTable = document.getElementById('customerTable');
const adminTable = document.getElementById('adminTable');
const expiringBadge = document.getElementById('expiringBadge');
const mainTitle = document.getElementById('mainTitle');
const customModal = document.getElementById('customModal');
const adminModal = document.getElementById('adminModal');

const serviceIcons = {
    "ChatGPT Plus": '<i class="ph ph-robot" style="color:#10a37f"></i>',
    "Adobe Creative Cloud": '<i class="ph ph-swatches" style="color:#ff0000"></i>',
    "Canva Pro": '<i class="ph ph-paint-brush-broad" style="color:#00c4cc"></i>',
    "Netflix Premium": '<i class="ph ph-video-camera" style="color:#e50914"></i>',
    "Midjourney": '<i class="ph ph-sailboat" style="color:#ffffff"></i>',
    "Khác": '<i class="ph ph-atom" style="color:var(--text-muted)"></i>'
};

// ======================================
// API HELPERS (thay thế Firestore CRUD)
// ======================================
async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

async function apiPost(path, data) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

async function apiPut(path, data) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

async function apiDelete(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
}

// ======================================
// CRUD WRAPPERS (giữ nguyên tên hàm cũ)
// ======================================
async function fsAddCustomer(data) {
    try { const r = await apiPost('/customers', data); showToast('✅ Đã lưu khách hàng!'); return r.id; }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsUpdateCustomer(id, data) {
    try { await apiPut(`/customers/${id}`, data); }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsDeleteCustomer(id) {
    try { await apiDelete(`/customers/${id}`); showToast('🗑️ Đã xóa khách hàng.'); }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsAddAdmin(data) {
    try { const r = await apiPost('/admins', data); showToast('✅ Đã lưu Quản Trị Viên!'); return r.id; }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsUpdateAdmin(id, data) {
    try { await apiPut(`/admins/${id}`, data); showToast('✅ Đã cập nhật Quản Trị Viên!'); }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsDeleteAdmin(id) {
    try { await apiDelete(`/admins/${id}`); showToast('🗑️ Đã xóa Quản Trị Viên.'); }
    catch (e) { showToast('❌ Lỗi: ' + e.message); console.error(e); throw e; }
}
async function fsAddNotification(data) {
    try { await apiPost('/notifications', data); }
    catch (e) { console.error(e); }
}
async function fsUpdateNotification(id, data) {
    try { await apiPut(`/notifications/${id}`, data); }
    catch (e) { console.error(e); }
}

// ======================================
// SSE REAL-TIME (thay thế onSnapshot)
// ======================================
function setupSSE() {
    const eventSource = new EventSource(`${API_BASE}/events`);

    eventSource.onmessage = async (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'customers_changed') {
                cachedCustomers = await apiGet('/customers');
                if (currentView !== 'admins') renderTable(searchInput.value);
                updateExpiringBadge();
            }
            if (msg.type === 'admins_changed') {
                cachedAdmins = await apiGet('/admins');
                updateAdminSelects();
                if (currentView === 'admins') renderAdmins();
                updateStatCards();
            }
            if (msg.type === 'notifications_changed') {
                cachedNotifications = await apiGet('/notifications');
                renderNotifications();
            }
        } catch (e) { console.error('SSE error:', e); }
    };

    eventSource.onerror = () => {
        console.warn('⚠ SSE mất kết nối, thử kết nối lại...');
    };
}

// ======================================
// HELPERS
// ======================================
function calculateDaysLeft(endDateStr) {
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(endDateStr); end.setHours(0,0,0,0);
    return Math.ceil((end - today) / 86400000);
}

function formatDate(s) {
    if (!s) return '';
    const p = s.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
}

// ======================================
// VIEW & NAV
// ======================================
window.switchView = function (view, el) {
    document.querySelectorAll('.nav-links > li').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.submenu li').forEach(li => li.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('viewCustomers').classList.remove('active');
    document.getElementById('viewAdmins').classList.remove('active');
    currentView = view;
    if (view === 'admins') { document.getElementById('viewAdmins').classList.add('active'); renderAdmins(); }
    else {
        document.getElementById('viewCustomers').classList.add('active');
        currentFilterService = '';
        if (view === 'home') mainTitle.textContent = "Tất Cả Khách Hàng";
        if (view === 'expiring') mainTitle.textContent = "Tài Khoản Gần Hết Hạn (<5 Ngày)";
        renderTable(searchInput.value);
    }
}

window.toggleSubmenu = function (id) {
    const m = document.getElementById(id), li = m.previousElementSibling;
    m.classList.toggle('open'); li.classList.toggle('open');
}

window.filterByService = function (svc, el) {
    document.querySelectorAll('.nav-links > li').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.submenu li').forEach(li => li.classList.remove('active'));
    el.parentElement.previousElementSibling.classList.add('active');
    el.classList.add('active');
    switchView('home', null);
    currentFilterService = svc;
    mainTitle.textContent = svc === '' ? "Tất Cả Khách Hàng" : `Dịch Vụ: ${svc}`;
    renderTable(searchInput.value);
}

// ======================================
// RENDERING (từ cache)
// ======================================
function renderTable(searchTerm = '') {
    tableBody.innerHTML = '';
    let filtered = cachedCustomers.filter(c =>
        c.phone.includes(searchTerm) || c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (currentFilterService) filtered = filtered.filter(c => c.service === currentFilterService);
    if (currentView === 'expiring') filtered = filtered.filter(c => calculateDaysLeft(c.endDate) <= 5);

    if (!filtered.length) { customerTable.style.display = 'none'; emptyState.style.display = 'flex'; return; }
    customerTable.style.display = 'table'; emptyState.style.display = 'none';

    filtered.forEach(c => {
        const dl = calculateDaysLeft(c.endDate), exp = dl <= 5;
        const admin = cachedAdmins.find(a => a.id == c.adminId);
        const aName = admin ? admin.name : "N/A", aEmail = admin ? admin.email : "";

        let badge = '';
        if (dl < 0) badge = `<span class="badge danger">Đã hết hạn (${Math.abs(dl)} ngày trước)</span>`;
        else if (dl <= 5) badge = `<span class="badge warning">Sắp hết hạn (Còn ${dl} ngày)</span>`;
        else badge = `<span class="badge safe">Đang hoạt động (Còn ${dl} ngày)</span>`;

        const tr = document.createElement('tr');
        if (exp) tr.className = 'expiring-soon';

        let mailBtn = '';
        if (exp && aEmail) {
            const subj = encodeURIComponent(`[Cảnh Báo] Khách hàng ${c.name} sắp hết hạn dịch vụ`);
            const body = encodeURIComponent(`Chào ${aName},\n\nKhách hàng ${c.name} (SĐT: ${c.phone}) (Dịch vụ ${c.service}) đang còn <= 5 ngày.\n\nVui lòng hỗ trợ!`);
            mailBtn = `<a href="mailto:${aEmail}?subject=${subj}&body=${body}" target="_blank" class="btn-icon mail" title="Gửi mail"><i class="ph ph-envelope-simple"></i></a>`;
        }

        tr.innerHTML = `
            <td title="${c.name} — ${c.service}"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;">${c.name}</div><div style="font-size:0.75rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;">${serviceIcons[c.service]||''} ${c.service}</div></td>
            <td title="${c.phone}">${c.phone}</td>
            <td title="${aName}"><div style="display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;"><i class="ph ph-identification-card"></i>${aName}</div></td>
            <td title="${c.email}" style="overflow:hidden;text-overflow:ellipsis;">${c.email}</td>
            <td><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:0.85rem;">••••••</span><i class="ph ph-copy btn-icon" title="Sao chép" onclick="copyText('${c.password}')" style="font-size:1rem;"></i></div></td>
            <td>${formatDate(c.startDate)}</td>
            <td>${formatDate(c.endDate)}</td>
            <td style="white-space:normal;">${badge}</td>
            <td class="action-btns">${mailBtn}
                <button class="btn-icon" onclick="editCustomer('${c.id}')" title="Sửa"><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon delete" onclick="deleteCustomer('${c.id}')" title="Xoá"><i class="ph ph-trash"></i></button>
            </td>`;
        tableBody.appendChild(tr);
    });
}

function renderAdmins() {
    adminTableBody.innerHTML = '';
    if (!cachedAdmins.length) { adminTable.style.display = 'none'; emptyAdminState.style.display = 'flex'; return; }
    adminTable.style.display = 'table'; emptyAdminState.style.display = 'none';
    cachedAdmins.forEach(a => {
        const cnt = cachedCustomers.filter(c => c.adminId == a.id).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${a.name}</strong></td><td>${a.email}</td><td>${cnt} khách hàng</td>
            <td class="action-btns">
                <button class="btn-icon" onclick="editAdmin('${a.id}')" title="Sửa"><i class="ph ph-pencil-simple"></i></button>
                <button class="btn-icon delete" onclick="deleteAdmin('${a.id}')" title="Xoá"><i class="ph ph-trash"></i></button>
            </td>`;
        adminTableBody.appendChild(tr);
    });
}

function updateAdminSelects() {
    document.getElementById('custAdmin').innerHTML = cachedAdmins.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

window.copyText = function (t) { navigator.clipboard.writeText(t).then(() => alert("Đã sao chép: " + t)); }

// ======================================
// NOTIFICATION CENTER
// ======================================
function processAutomatedEmails() {
    cachedCustomers.forEach(async c => {
        const dl = calculateDaysLeft(c.endDate);
        if (dl <= 5 && !c.isEmailSent) {
            const admin = cachedAdmins.find(a => a.id == c.adminId);
            if (admin && admin.email && EMAILJS_PUBLIC_KEY !== "YOUR_PUBLIC_KEY_HERE") {
                try {
                    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                        to_email: admin.email, admin_name: admin.name,
                        customer_name: c.name, customer_service: c.service, days_left: dl
                    });
                } catch (e) { console.error(e); }
            }
            await fsUpdateCustomer(c.id, { isEmailSent: true });
        }
    });
}

window.toggleNotifDropdown = function () {
    document.getElementById('notifDropdown').classList.toggle('show');
    isAlarmSilenced = true; stopAlarmLoop();
}

window.markNotifAsRead = async function (docId) { await fsUpdateNotification(docId, { isRead: true }); }

document.addEventListener('click', e => {
    const w = document.querySelector('.notif-wrapper'), d = document.getElementById('notifDropdown');
    if (w && d && !w.contains(e.target)) d.classList.remove('show');
});

function renderNotifications() {
    const badge = document.getElementById('bellBadge'), list = document.getElementById('notifList');
    const unread = cachedNotifications.filter(n => !n.isRead).length;
    if (unread > 0) { badge.style.display = 'inline-block'; badge.textContent = unread; badge.classList.add('pulse'); }
    else { badge.style.display = 'none'; badge.classList.remove('pulse'); stopAlarmLoop(); }

    if (!cachedNotifications.length) {
        list.innerHTML = `<div class="notif-empty"><i class="ph ph-bell-slash" style="font-size:2rem;margin-bottom:8px;"></i><br>Chưa có thông báo</div>`;
    } else {
        list.innerHTML = cachedNotifications.sort((a, b) => new Date(b.time) - new Date(a.time)).map(n => `
            <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="markNotifAsRead('${n.id}')">
                <div class="notif-title">${n.title}</div>
                <div class="notif-body">${n.body}</div>
                <div class="notif-time">${new Date(n.time).toLocaleString('vi-VN')}</div>
            </div>`).join('');
    }
}

function updateExpiringBadge() {
    const c = cachedCustomers.filter(x => calculateDaysLeft(x.endDate) <= 5).length;
    if (c > 0) { expiringBadge.style.display = 'inline-block'; expiringBadge.textContent = c; }
    else expiringBadge.style.display = 'none';
    updateStatCards();
}

function updateStatCards() {
    const total = cachedCustomers.length;
    const expiring = cachedCustomers.filter(x => calculateDaysLeft(x.endDate) <= 5).length;
    const active = total - expiring;
    const admins = cachedAdmins.length;
    
    animateValue('statTotal', total);
    animateValue('statExpiring', expiring);
    animateValue('statActive', active);
    animateValue('statAdmins', admins);
}

function animateValue(id, end) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = parseInt(el.textContent) || 0;
    if (current === end) return;
    const duration = 400;
    const startTime = performance.now();
    function step(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        el.textContent = Math.round(current + (end - current) * progress);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

async function checkAndGenerateNotifications() {
    let hasNew = false;
    for (const c of cachedCustomers) {
        const dl = calculateDaysLeft(c.endDate);
        if (dl <= 5 && !c.isNotifGenerated) {
            await fsAddNotification({
                custId: c.id, title: `⚠ Cảnh báo: ${c.name}`,
                body: `Dịch vụ ${c.service} ${dl <= 0 ? 'đã hết hạn' : 'chỉ còn ' + dl + ' ngày'}.`,
                time: new Date().toISOString(), isRead: false
            });
            await fsUpdateCustomer(c.id, { isNotifGenerated: true });
            hasNew = true;
        }
    }
    if (hasNew) { isAlarmSilenced = false; if (audioUnlocked) startAlarmLoop(); }
}

window.showToast = function (msg) {
    const c = document.getElementById('toastContainer'), t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<i class="ph ph-bell-ringing" style="font-size:24px;"></i> <div>${msg}</div>`;
    c.appendChild(t);
    setTimeout(() => { t.classList.add('fade-out'); setTimeout(() => t.remove(), 300); }, 5000);
}

// ======================================
// FORMS: CUSTOMER
// ======================================
document.getElementById('addBtn').addEventListener('click', () => {
    updateAdminSelects();
    document.getElementById('modalTitle').textContent = "Thêm Khách Hàng";
    document.getElementById('custStart').value = new Date().toISOString().split('T')[0];
    const nm = new Date(); nm.setMonth(nm.getMonth() + 1);
    document.getElementById('custEnd').value = nm.toISOString().split('T')[0];
    customModal.classList.add('active');
});

document.getElementById('closeModal').addEventListener('click', () => { customModal.classList.remove('active'); document.getElementById('customerForm').reset(); document.getElementById('custId').value = ''; });
document.getElementById('cancelBtn').addEventListener('click', () => { customModal.classList.remove('active'); document.getElementById('customerForm').reset(); document.getElementById('custId').value = ''; });

document.getElementById('customerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('custId').value;
    const data = {
        name: document.getElementById('custName').value,
        phone: document.getElementById('custPhone').value,
        service: document.getElementById('custService').value,
        adminId: document.getElementById('custAdmin').value,
        email: document.getElementById('custEmail').value,
        password: document.getElementById('custPwd').value,
        startDate: document.getElementById('custStart').value,
        endDate: document.getElementById('custEnd').value,
        isEmailSent: false, isNotifGenerated: false
    };
    try {
        if (id) await fsUpdateCustomer(id, data);
        else await fsAddCustomer(data);
        customModal.classList.remove('active');
        document.getElementById('customerForm').reset();
        document.getElementById('custId').value = '';
        setTimeout(() => checkAndGenerateNotifications(), 500);
    } catch (e) { console.error(e); }
});

window.editCustomer = function (docId) {
    updateAdminSelects();
    const c = cachedCustomers.find(x => x.id === docId);
    if (!c) return;
    document.getElementById('custId').value = c.id;
    document.getElementById('custName').value = c.name;
    document.getElementById('custPhone').value = c.phone;
    document.getElementById('custService').value = c.service;
    document.getElementById('custAdmin').value = c.adminId;
    document.getElementById('custEmail').value = c.email;
    document.getElementById('custPwd').value = c.password;
    document.getElementById('custStart').value = c.startDate;
    document.getElementById('custEnd').value = c.endDate;
    document.getElementById('modalTitle').textContent = "Chỉnh Sửa Khách Hàng";
    customModal.classList.add('active');
}

window.deleteCustomer = async function (docId) {
    if (confirm('Xóa khách hàng này?')) await fsDeleteCustomer(docId);
}

// ======================================
// FORMS: ADMIN
// ======================================
document.getElementById('addAdminBtn').addEventListener('click', () => {
    document.getElementById('adminModalTitle').textContent = "Thêm Quản Trị Viên";
    adminModal.classList.add('active');
});
document.getElementById('closeAdminModal').addEventListener('click', () => { adminModal.classList.remove('active'); document.getElementById('adminForm').reset(); document.getElementById('adminId').value = ''; });
document.getElementById('cancelAdminBtn').addEventListener('click', () => { adminModal.classList.remove('active'); document.getElementById('adminForm').reset(); document.getElementById('adminId').value = ''; });

document.getElementById('adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('adminId').value;
    const data = { name: document.getElementById('adminName').value, email: document.getElementById('adminEmail').value };
    try {
        if (id) await fsUpdateAdmin(id, data);
        else await fsAddAdmin(data);
        adminModal.classList.remove('active');
        document.getElementById('adminForm').reset();
        document.getElementById('adminId').value = '';
    } catch (e) { console.error(e); }
});

window.editAdmin = function (docId) {
    const a = cachedAdmins.find(x => x.id === docId);
    if (!a) return;
    document.getElementById('adminId').value = a.id;
    document.getElementById('adminName').value = a.name;
    document.getElementById('adminEmail').value = a.email;
    document.getElementById('adminModalTitle').textContent = "Chỉnh Sửa Quản Trị Viên";
    adminModal.classList.add('active');
}

window.deleteAdmin = async function (docId) {
    if (confirm('Xóa Quản Trị Viên này?')) await fsDeleteAdmin(docId);
}

searchInput.addEventListener('input', (e) => { if (currentView !== 'admins') renderTable(e.target.value); });

// ======================================
// KHỞI ĐỘNG
// ======================================
async function init() {
    try {
        showToast("⏳ Đang kết nối Server...");

        // Tải dữ liệu ban đầu
        cachedCustomers = await apiGet('/customers');
        cachedAdmins = await apiGet('/admins');
        cachedNotifications = await apiGet('/notifications');

        // Render
        renderTable();
        updateAdminSelects();
        updateExpiringBadge();
        renderNotifications();
        updateStatCards();

        // Kết nối SSE real-time
        setupSSE();

        // Kiểm tra thông báo & email
        setTimeout(() => {
            checkAndGenerateNotifications();
            processAutomatedEmails();
        }, 500);

        showToast("✅ Kết nối Server thành công!");
    } catch (err) {
        console.error("❌ Lỗi:", err);
        showToast("❌ Lỗi kết nối Server: " + err.message);
    }
}

init();
