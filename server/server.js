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
// AUTH MIDDLEWARE
// ======================================
function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Chưa đăng nhập' });
    }
    const token = auth.split(' ')[1];
    const user = db.getSession(token);
    if (!user) {
        return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
    }
    req.user = user;
    req.token = token;
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Không có quyền truy cập' });
        }
        next();
    };
}

// ======================================
// API: AUTH
// ======================================
app.post('/api/auth/register', (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
        }
        const result = db.createUser({ fullName, email, password, role: 'user' });
        if (result.error) return res.status(400).json({ error: result.error });
        res.status(201).json({ success: true, message: 'Đăng ký thành công!' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password, loginAs } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
        }
        const user = db.verifyPassword(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
        }
        // Nếu đăng nhập qua luồng Quản Trị Viên, kiểm tra quyền
        if (loginAs === 'admin' && user.role === 'user') {
            return res.status(403).json({ error: 'Tài khoản không có quyền Quản Trị Viên' });
        }
        const token = db.createSession(user.id);
        res.json({ token, user });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/logout', authMiddleware, (req, res) => {
    try {
        db.deleteSession(req.token);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json(req.user);
});

// ======================================
// API: USERS (SuperAdmin only)
// ======================================
app.get('/api/users', authMiddleware, requireRole('superadmin'), (req, res) => {
    try {
        res.json(db.getAllUsers());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/users/:id/role', authMiddleware, requireRole('superadmin'), (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Role không hợp lệ' });
        }
        const ok = db.updateUserRole(req.params.id, role);
        if (!ok) return res.status(404).json({ error: 'Không tìm thấy hoặc không thể thay đổi' });
        broadcast('users_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/users/:id', authMiddleware, requireRole('superadmin'), (req, res) => {
    try {
        const ok = db.deleteUser(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Không tìm thấy hoặc không thể xóa' });
        broadcast('users_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ======================================
// API: CUSTOMERS (yêu cầu đăng nhập + role admin)
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
// API: SERVICES
// ======================================
app.get('/api/services', (req, res) => {
    try {
        res.json(db.getAllServices());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/services', (req, res) => {
    try {
        const id = db.addService(req.body);
        broadcast('services_changed');
        res.status(201).json({ id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/services/:id', (req, res) => {
    try {
        const ok = db.updateService(req.params.id, req.body);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('services_changed');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/services/:id', (req, res) => {
    try {
        const ok = db.deleteService(req.params.id);
        if (!ok) return res.status(404).json({ error: 'Not found' });
        broadcast('services_changed');
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
