// ======================================
// DATABASE MODULE — SQLite (sql.js — pure JS)
// ======================================
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data.db');

let db = null;

// ======================================
// KHỞI TẠO DATABASE (async vì sql.js cần init WASM)
// ======================================
async function initDatabase() {
    const SQL = await initSqlJs();

    // Nếu đã có file database, đọc vào
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    // Tạo bảng
    db.run(`
        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            service TEXT DEFAULT '',
            adminId TEXT DEFAULT '',
            email TEXT DEFAULT '',
            password TEXT DEFAULT '',
            startDate TEXT DEFAULT '',
            endDate TEXT DEFAULT '',
            isEmailSent INTEGER DEFAULT 0,
            isNotifGenerated INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS admins (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT DEFAULT ''
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            custId TEXT DEFAULT '',
            title TEXT DEFAULT '',
            body TEXT DEFAULT '',
            time TEXT DEFAULT '',
            isRead INTEGER DEFAULT 0
        )
    `);

    saveToFile();
    seedIfEmpty();

    return db;
}

// Lưu database ra file
function saveToFile() {
    if (!db) return;
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

// Helper: chạy query SELECT trả về mảng objects
function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

// Helper: chạy query SELECT trả về 1 row
function queryOne(sql, params = []) {
    const rows = queryAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

// Helper: chạy INSERT/UPDATE/DELETE
function execute(sql, params = []) {
    db.run(sql, params);
    saveToFile();
}

// ======================================
// CUSTOMERS
// ======================================
function getAllCustomers() {
    return queryAll('SELECT * FROM customers').map(formatCustomer);
}

function getCustomer(id) {
    const row = queryOne('SELECT * FROM customers WHERE id = ?', [id]);
    return row ? formatCustomer(row) : null;
}

function addCustomer(data) {
    const id = uuidv4();
    execute(
        `INSERT INTO customers (id, name, phone, service, adminId, email, password, startDate, endDate, isEmailSent, isNotifGenerated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.name || '', data.phone || '', data.service || '', data.adminId || '',
         data.email || '', data.password || '', data.startDate || '', data.endDate || '',
         data.isEmailSent ? 1 : 0, data.isNotifGenerated ? 1 : 0]
    );
    return id;
}

function updateCustomer(id, data) {
    const existing = getCustomer(id);
    if (!existing) return false;

    const fields = [];
    const values = [];
    for (const key of ['name', 'phone', 'service', 'adminId', 'email', 'password', 'startDate', 'endDate']) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(data[key]);
        }
    }
    for (const key of ['isEmailSent', 'isNotifGenerated']) {
        if (data[key] !== undefined) {
            fields.push(`${key} = ?`);
            values.push(data[key] ? 1 : 0);
        }
    }
    if (fields.length === 0) return true;

    values.push(id);
    execute(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
}

function deleteCustomer(id) {
    const before = queryAll('SELECT COUNT(*) as cnt FROM customers WHERE id = ?', [id]);
    if (before[0].cnt === 0) return false;
    execute('DELETE FROM customers WHERE id = ?', [id]);
    return true;
}

function formatCustomer(row) {
    return {
        ...row,
        isEmailSent: !!row.isEmailSent,
        isNotifGenerated: !!row.isNotifGenerated
    };
}

// ======================================
// ADMINS
// ======================================
function getAllAdmins() {
    return queryAll('SELECT * FROM admins');
}

function addAdmin(data) {
    const id = uuidv4();
    execute('INSERT INTO admins (id, name, email) VALUES (?, ?, ?)',
        [id, data.name || '', data.email || '']);
    return id;
}

function updateAdmin(id, data) {
    const existing = queryOne('SELECT * FROM admins WHERE id = ?', [id]);
    if (!existing) return false;

    const fields = [];
    const values = [];
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (fields.length === 0) return true;

    values.push(id);
    execute(`UPDATE admins SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
}

function deleteAdmin(id) {
    const before = queryAll('SELECT COUNT(*) as cnt FROM admins WHERE id = ?', [id]);
    if (before[0].cnt === 0) return false;
    execute('DELETE FROM admins WHERE id = ?', [id]);
    return true;
}

// ======================================
// NOTIFICATIONS
// ======================================
function getAllNotifications() {
    return queryAll('SELECT * FROM notifications ORDER BY time DESC')
        .map(n => ({ ...n, isRead: !!n.isRead }));
}

function addNotification(data) {
    const id = uuidv4();
    execute(
        'INSERT INTO notifications (id, custId, title, body, time, isRead) VALUES (?, ?, ?, ?, ?, ?)',
        [id, data.custId || '', data.title || '', data.body || '',
         data.time || new Date().toISOString(), data.isRead ? 1 : 0]
    );
    return id;
}

function updateNotification(id, data) {
    const fields = [];
    const values = [];
    if (data.isRead !== undefined) { fields.push('isRead = ?'); values.push(data.isRead ? 1 : 0); }
    if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title); }
    if (data.body !== undefined) { fields.push('body = ?'); values.push(data.body); }
    if (fields.length === 0) return true;

    values.push(id);
    execute(`UPDATE notifications SET ${fields.join(', ')} WHERE id = ?`, values);
    return true;
}

// ======================================
// SEED DATA (nếu database trống)
// ======================================
function seedIfEmpty() {
    const count = queryOne('SELECT COUNT(*) as cnt FROM customers');
    if (count.cnt === 0) {
        console.log('📦 Đang tạo dữ liệu mẫu...');
        const a1 = addAdmin({ name: 'Hoàng Minh', email: 'hoangminh.admin@email.com' });
        const a2 = addAdmin({ name: 'Lê Nga', email: 'lenga.support@email.com' });

        addCustomer({ name: 'Nguyễn Văn Tuấn', phone: '0901234567', service: 'ChatGPT Plus', adminId: a1, email: 'tuan@email.com', password: 'chatgpt123', startDate: '2026-03-01', endDate: '2026-04-16', isEmailSent: false, isNotifGenerated: false });
        addCustomer({ name: 'Trần Thị Bé', phone: '0987654321', service: 'Canva Pro', adminId: a2, email: 'be@email.com', password: 'canvapro', startDate: '2026-01-10', endDate: '2027-01-10', isEmailSent: false, isNotifGenerated: false });
        addCustomer({ name: 'Lê Minh Khang', phone: '0912345678', service: 'Adobe Creative Cloud', adminId: a1, email: 'khang@email.com', password: 'adobe890', startDate: '2026-04-01', endDate: '2026-05-01', isEmailSent: false, isNotifGenerated: false });

        console.log('✅ Dữ liệu mẫu đã tạo xong!');
    }
}

// ======================================
// EXPORT
// ======================================
module.exports = {
    initDatabase,
    getAllCustomers, getCustomer, addCustomer, updateCustomer, deleteCustomer,
    getAllAdmins, addAdmin, updateAdmin, deleteAdmin,
    getAllNotifications, addNotification, updateNotification,
    close: () => { if (db) { saveToFile(); db.close(); } }
};
