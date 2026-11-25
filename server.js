const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(__dirname));

const SECRET = 'nexora-secret-2026';

// Connect to Render PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create tables automatically on startup
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    business VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    slug VARCHAR(255) UNIQUE,
    whatsapp VARCHAR(255)
  );
  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    name VARCHAR(255),
    price NUMERIC,
    image_url TEXT
  );
`).catch(err => console.error("Database init error:", err));

// API: Register
app.post('/api/register', async (req, res) => {
    try {
        const { business, email, password, whatsapp } = req.body;
        const hash = await bcrypt.hash(password, 10);
        const slug = business.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        await pool.query(
            'INSERT INTO users (business, email, password, slug, whatsapp) VALUES ($1, $2, $3, $4, $5)',
            [business, email, hash, slug, whatsapp]
        );
        res.status(200).json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(400).json({ error: 'Email or Business name already exists' });
    }
});

// API: Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ id: user.id }, SECRET);
        res.cookie('token', token, { httpOnly: true });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

app.get('/logout', (req, res) => { res.clearCookie('token'); res.redirect('/'); });

const auth = (req, res, next) => {
    if (!req.cookies.token) return res.redirect('/login');
    try { req.userId = jwt.verify(req.cookies.token, SECRET).id; next(); }
    catch { res.redirect('/login'); }
};

// Dashboard
app.get('/dashboard', auth, async (req, res) => {
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
        const user = userRes.rows[0];
        
        const prodRes = await pool.query('SELECT * FROM products WHERE user_id = $1', [req.userId]);
        let productHTML = prodRes.rows.map(p => `
            <div class="glass p-4 mb-3 rounded-lg flex items-center gap-4">
                ${p.image_url ? `<img src="${p.image_url}" class="w-16 h-16 object-cover rounded">` : ''}
                <div>
                    <h3 class="text-gold font-bold">${p.name}</h3>
                    <p class="text-gray-400">₦${p.price}</p>
                </div>
            </div>
        `).join('');

        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
            <style>body{background:#0A0A0A;color:white;} .glass{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);} .text-gold{color:#D4AF37;}</style></head>
            <body class="p-6">
                <h1 class="text-2xl font-bold text-[#D4AF37] mb-2">${user.business}</h1>
                <p class="mb-6 text-sm text-gray-400">Shop Link: <a href="/shop/${user.slug}" class="text-blue-400 underline">/shop/${user.slug}</a></p>
                
                <div class="glass p-5 rounded-xl mb-8">
                    <h2 class="text-lg font-bold mb-3">Add Product</h2>
                    <form action="/api/products" method="POST" class="flex flex-col gap-3">
                        <input name="name" placeholder="Product Name" class="p-3 bg-black/50 border border-white/10 rounded text-white" required>
                        <input name="price" type="number" placeholder="Price (₦)" class="p-3 bg-black/50 border border-white/10 rounded text-white" required>
                        <input name="imageUrl" type="url" placeholder="Image URL (e.g. from Google)" class="p-3 bg-black/50 border border-white/10 rounded text-white">
                        <button class="bg-[#D4AF37] text-black p-3 rounded font-bold mt-2">Add Product</button>
                    </form>
                </div>

                <div><h2 class="text-lg font-bold mb-3">My Catalog</h2>${productHTML || '<p class="text-gray-500">No products yet.</p>'}</div>
                <div class="mt-8 flex gap-4">
                    <a href="/explore" class="text-blue-400 font-bold">Explore Shops</a>
                    <a href="/logout" class="text-red-400 font-bold">Logout</a>
                </div>
            </body></html>
        `);
    } catch (e) { res.send('Error loading dashboard'); }
});

app.post('/api/products', auth, async (req, res) => {
    try {
        const { name, price, imageUrl } = req.body;
        await pool.query(
            'INSERT INTO products (user_id, name, price, image_url) VALUES ($1, $2, $3, $4)',
            [req.userId, name, price, imageUrl || null]
        );
        res.redirect('/dashboard');
    } catch (e) { res.send('Error adding product'); }
});

// PREMIUM EXPLORE PAGE
app.get('/explore', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users');
        const shops = result.rows.map(u => `
            <a href="/shop/${u.slug}" class="glass p-6 rounded-xl block hover:-translate-y-1 transition duration-300">
                <h3 class="text-xl font-bold text-[#D4AF37] mb-1">${u.business}</h3>
                <p class="text-gray-400 text-sm">Click to visit shop →</p>
            </a>
        `).join('');

        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
            <style>body{background:#0A0A0A;color:white;} .glass{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);}</style></head>
            <body class="p-6 max-w-4xl mx-auto">
                <a href="/" class="text-2xl font-bold text-[#D4AF37] tracking-wide block mb-8 text-center">NEXORA</a>
                <h1 class="text-3xl font-bold mb-8 text-center">Explore Shops</h1>
                <div class="grid md:grid-cols-2 gap-4">${shops || '<p class="text-center text-gray-500">No shops registered yet.</p>'}</div>
                <div class="text-center mt-10"><a href="/register" class="text-[#D4AF37] font-bold">Create your own shop →</a></div>
            </body></html>
        `);
    } catch (e) { res.send('Error loading explore page'); }
});

// Login Page
app.get('/login', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>body { background: #0A0A0A; color: white; } .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }</style></head>
        <body class="min-h-screen flex items-center justify-center p-6">
            <div class="glass p-8 rounded-3xl w-full max-w-sm shadow-2xl">
                <h1 class="text-3xl font-bold text-[#D4AF37] mb-8 text-center tracking-widest">NEXORA</h1>
                <div id="errorMsg" class="text-red-400 text-sm mb-4 hidden text-center">Invalid login</div>
                <form id="loginForm" class="flex flex-col gap-4">
                    <input name="email" type="email" placeholder="Email Address" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <input name="password" type="password" placeholder="Password" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <button type="submit" class="bg-[#D4AF37] text-black p-4 rounded-xl font-bold mt-2 hover:bg-yellow-500 transition">Sign In</button>
                </form>
                <p class="mt-6 text-center text-sm text-gray-400">No account? <a href="/register" class="text-[#D4AF37] font-semibold">Create Shop</a></p>
            </div>
            <script>
                document.getElementById('loginForm').onsubmit = async (e) => {
                    e.preventDefault(); const form = e.target;
                    const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email: form.email.value, password: form.password.value }) });
                    if (res.ok) window.location.href = '/dashboard';
                    else document.getElementById('errorMsg').classList.remove('hidden');
                };
            </script>
        </body></html>
    `);
});

// Register Page with Animation
app.get('/register', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background: #0A0A0A; color: white; } .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
            #successScreen { position: fixed; inset: 0; background: #000; z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 1s ease-in-out; }
            #successScreen.show { opacity: 1; pointer-events: auto; }
            .nexora-text { font-size: 3rem; font-weight: 900; color: #D4AF37; letter-spacing: 0.2em; text-shadow: 0 0 30px rgba(212,175,55,0.5); animation: pulseGlow 2s infinite alternate; }
            @keyframes pulseGlow { 0% { transform: scale(0.95); opacity: 0.7; } 100% { transform: scale(1.05); opacity: 1; } }
        </style></head>
        <body class="min-h-screen flex items-center justify-center p-6">
            <div id="successScreen"><div class="nexora-text">NEXORA</div><p class="text-gray-400 mt-4 text-sm tracking-widest uppercase">Shop Created</p></div>
            <div class="glass p-8 rounded-3xl w-full max-w-sm shadow-2xl">
                <h1 class="text-2xl font-bold text-white mb-6 text-center">Create Your Shop</h1>
                <div id="errorMsg" class="text-red-400 text-sm mb-4 hidden text-center">Email or Business name taken.</div>
                <form id="regForm" class="flex flex-col gap-3">
                    <input name="business" placeholder="Business Name" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <input name="email" type="email" placeholder="Email Address" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <input name="whatsapp" placeholder="WhatsApp (23480...)" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <input name="password" type="password" placeholder="Password" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <button type="submit" id="submitBtn" class="bg-[#D4AF37] text-black p-4 rounded-xl font-bold mt-2 hover:bg-yellow-500 transition">Create Account</button>
                </form>
                <p class="mt-6 text-center text-sm text-gray-400">Have an account? <a href="/login" class="text-[#D4AF37] font-semibold">Login</a></p>
            </div>
            <script>
                document.getElementById('regForm').onsubmit = async (e) => {
                    e.preventDefault(); const form = e.target; const btn = document.getElementById('submitBtn'); btn.innerText = 'Processing...';
                    const res = await fetch('/api/register', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ business: form.business.value, email: form.email.value, whatsapp: form.whatsapp.value, password: form.password.value }) });
                    if (res.ok) { document.getElementById('successScreen').classList.add('show'); setTimeout(() => { window.location.href = '/login'; }, 3000); }
                    else { btn.innerText = 'Create Account'; document.getElementById('errorMsg').classList.remove('hidden'); }
                };
            </script>
        </body></html>
    `);
});

// Public Storefront
app.get('/shop/:slug', async (req, res) => {
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE slug = $1', [req.params.slug]);
        const user = userRes.rows[0];
        if (!user) return res.send('Shop not found.');
        
        const prodRes = await pool.query('SELECT * FROM products WHERE user_id = $1', [user.id]);
        let productHTML = prodRes.rows.map(p => `
            <div class="glass rounded-xl mb-4 overflow-hidden">
                ${p.image_url ? `<img src="${p.image_url}" class="w-full h-48 object-cover">` : ''}
                <div class="p-5">
                    <h3 class="text-lg font-bold text-[#D4AF37]">${p.name}</h3>
                    <p class="text-gray-400 mb-4">₦${p.price}</p>
                    <a href="https://wa.me/${user.whatsapp}?text=Hi, I want to order ${p.name}" class="block bg-green-600 text-center p-3 rounded-lg font-bold text-white hover:bg-green-500 transition">Order on WhatsApp</a>
                </div>
            </div>
        `).join('');

        res.send(`
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
            <style>body{background:#0A0A0A;color:white;} .glass{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);}</style></head>
            <body class="p-6">
                <h1 class="text-3xl font-bold text-[#D4AF37] mb-8 text-center">${user.business}</h1>
                <div class="max-w-md mx-auto">${productHTML || '<p class="text-center text-gray-500">No products yet.</p>'}</div>
                <div class="text-center mt-10"><a href="/explore" class="text-gray-400 text-sm hover:text-white">← Back to Explore</a></div>
            </body></html>
        `);
    } catch (e) { res.send('Error loading shop'); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NEXORA is live with PostgreSQL'));
