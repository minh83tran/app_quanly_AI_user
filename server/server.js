// ======================================
// EXPRESS SERVER — AISHOP DASHBOARD
// ======================================
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (HTML, CSS, JS) từ thư mục gốc
app.use(express.static(path.join(__dirname, '..')));

// ======================================
// SSE (Server-Sent Events) — Real-time
// ======================================
const sseClients = new Set();

app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Gửi heartbeat mỗi 30s để giữ kết nối
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    sseClients.add(res);
    console.log(`📡 SSE client connected (total: ${sseClients.size})`);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients.delete(res);
        console.log(`📡 SSE client disconnected (total: ${sseClients.size})`);
    });
});

function broadcast(eventType) {
    const data = JSON.stringify({ type: eventType, time: Date.now() });
    for (const client of sseClients) {
        client.write(`data: ${data}\n\n`);
    }
}

// ======================================
// API: CUSTOMERS
// ======================================
app.get('/api/customers', (req, res) => {
    try {
        res.json(db.getAllCustomers());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/customers', (req, res) => {
    try {
        const id = db.addCustomer(req.body);
        broadcast('customers_changed');
        res.status(201).json({ id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/customers/:id', (req, res) => {
    try {
        const ok = db.updateCustomer(req.params.id, req.body);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('customers_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/customers/:id', (req, res) => {
    try {
        const ok = db.deleteCustomer(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('customers_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ======================================
// API: ADMINS
// ======================================
app.get('/api/admins', (req, res) => {
    try {
        res.json(db.getAllAdmins());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admins', (req, res) => {
    try {
        const id = db.addAdmin(req.body);
        broadcast('admins_changed');
        res.status(201).json({ id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/admins/:id', (req, res) => {
    try {
        const ok = db.updateAdmin(req.params.id, req.body);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('admins_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/admins/:id', (req, res) => {
    try {
        const ok = db.deleteAdmin(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('admins_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ======================================
// API: NOTIFICATIONS
// ======================================
app.get('/api/notifications', (req, res) => {
    try {
        res.json(db.getAllNotifications());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/notifications', (req, res) => {
    try {
        const id = db.addNotification(req.body);
        broadcast('notifications_changed');
        res.status(201).json({ id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/notifications/:id', (req, res) => {
    try {
        const ok = db.updateNotification(req.params.id, req.body);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('notifications_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ======================================
// KHỞI ĐỘNG SERVER (async vì sql.js cần init)
// ======================================
async function startServer() {
    try {
        // Khởi tạo database
        await db.initDatabase();
        console.log('✅ Database SQLite đã sẵn sàng!');

        // Start Express
        app.listen(PORT, () => {
            console.log('');
            console.log('╔══════════════════════════════════════════╗');
            console.log('║   🚀 AISHOP Dashboard Server Started!   ║');
            console.log('╠══════════════════════════════════════════╣');
            console.log(`║   🌐 http://localhost:${PORT}              ║`);
            console.log('║   📁 Database: server/data.db            ║');
            console.log('║   🔄 SSE Real-time: Enabled              ║');
            console.log('╚══════════════════════════════════════════╝');
            console.log('');
        });
    } catch (err) {
        console.error('❌ Lỗi khởi động:', err);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Đang tắt server...');
    db.close();
    process.exit(0);
});
