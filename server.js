const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const SECRET = 'nexora-secret-2026';
const DB = 'data.json';

if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ users: [], products: [] }));
const getDB = () => JSON.parse(fs.readFileSync(DB));
const saveDB = (data) => fs.writeFileSync(DB, JSON.stringify(data));

app.use(express.static(__dirname));

// API: Register
app.post('/api/register', async (req, res) => {
    try {
        const { business, email, password, whatsapp } = req.body;
        const db = getDB();
        if (db.users.find(u => u.email === email)) return res.status(400).json({ error: 'Email already exists' });
        
        const hash = await bcrypt.hash(password, 10);
        const slug = business.toLowerCase().replace(/[^a-z0-9]/g, '');
        db.users.push({ id: Date.now(), business, email, password: hash, slug, whatsapp });
        saveDB(db);
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

// API: Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getDB();
        const user = db.users.find(u => u.email === email);
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ id: user.id }, SECRET);
        res.cookie('token', token, { httpOnly: true });
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/logout', (req, res) => { res.clearCookie('token'); res.redirect('/'); });

const auth = (req, res, next) => {
    if (!req.cookies.token) return res.redirect('/login');
    try { req.userId = jwt.verify(req.cookies.token, SECRET).id; next(); }
    catch { res.redirect('/login'); }
};

// Dashboard (Simplified for now)
app.get('/dashboard', auth, (req, res) => {
    const db = getDB();
    const user = db.users.find(u => u.id === req.userId);
    const myProducts = db.products.filter(p => p.userId === user.id);
    let productHTML = myProducts.map(p => `<div class="glass p-4 mb-3 rounded-lg"><h3 class="text-gold font-bold">${p.name}</h3><p class="text-gray-400">₦${p.price}</p></div>`).join('');

    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>body{background:#0A0A0A;color:white;} .glass{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);}</style></head>
        <body class="p-6">
            <h1 class="text-2xl font-bold text-[#D4AF37] mb-2">${user.business}</h1>
            <p class="mb-6 text-sm text-gray-400">Shop Link: <a href="/shop/${user.slug}" class="text-blue-400 underline">/shop/${user.slug}</a></p>
            
            <div class="glass p-5 rounded-xl mb-8">
                <h2 class="text-lg font-bold mb-3">Add Product</h2>
                <form action="/api/products" method="POST" class="flex flex-col gap-3">
                    <input name="name" placeholder="Product Name" class="p-3 bg-black/50 border border-white/10 rounded text-white" required>
                    <input name="price" type="number" placeholder="Price (₦)" class="p-3 bg-black/50 border border-white/10 rounded text-white" required>
                    <button class="bg-[#D4AF37] text-black p-3 rounded font-bold">Add</button>
                </form>
            </div>

            <div><h2 class="text-lg font-bold mb-3">My Catalog</h2>${productHTML || '<p class="text-gray-500">No products yet.</p>'}</div>
            <a href="/logout" class="block mt-10 text-red-400 font-bold">Logout</a>
        </body></html>
    `);
});

app.post('/api/products', auth, (req, res) => {
    const { name, price } = req.body;
    const db = getDB();
    db.products.push({ id: Date.now(), userId: req.userId, name, price });
    saveDB(db);
    res.redirect('/dashboard');
});

// Premium Login Page
app.get('/login', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background: #0A0A0A; color: white; }
            .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
        </style></head>
        <body class="min-h-screen flex items-center justify-center p-6">
            <div class="glass p-8 rounded-3xl w-full max-w-sm shadow-2xl">
                <h1 class="text-3xl font-bold text-[#D4AF37] mb-8 text-center tracking-widest">NEXORA</h1>
                <div id="errorMsg" class="text-red-400 text-sm mb-4 hidden text-center"></div>
                <form id="loginForm" class="flex flex-col gap-4">
                    <input name="email" type="email" placeholder="Email Address" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <input name="password" type="password" placeholder="Password" class="p-4 bg-black/50 border border-white/10 rounded-xl text-white focus:outline-none focus:border-[#D4AF37]" required>
                    <button type="submit" class="bg-[#D4AF37] text-black p-4 rounded-xl font-bold mt-2 hover:bg-yellow-500 transition">Sign In</button>
                </form>
                <p class="mt-6 text-center text-sm text-gray-400">No account? <a href="/register" class="text-[#D4AF37] font-semibold">Create Shop</a></p>
            </div>
            <script>
                document.getElementById('loginForm').onsubmit = async (e) => {
                    e.preventDefault();
                    const form = e.target;
                    const res = await fetch('/api/login', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ email: form.email.value, password: form.password.value })
                    });
                    if (res.ok) window.location.href = '/dashboard';
                    else {
                        const err = document.getElementById('errorMsg');
                        err.classList.remove('hidden');
                        err.innerText = 'Invalid email or password.';
                    }
                };
            </script>
        </body></html>
    `);
});

// Premium Register Page with NEXORA Animation
app.get('/register', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>
            body { background: #0A0A0A; color: white; }
            .glass { background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
            
            /* The NEXORA Success Animation */
            #successScreen {
                position: fixed; inset: 0; background: #000; z-index: 9999;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                opacity: 0; pointer-events: none; transition: opacity 1s ease-in-out;
            }
            #successScreen.show { opacity: 1; pointer-events: auto; }
            .nexora-text {
                font-size: 3rem; font-weight: 900; color: #D4AF37; letter-spacing: 0.2em;
                text-shadow: 0 0 30px rgba(212,175,55,0.5);
                animation: pulseGlow 2s infinite alternate;
            }
            @keyframes pulseGlow {
                0% { transform: scale(0.95); opacity: 0.7; }
                100% { transform: scale(1.05); opacity: 1; }
            }
        </style></head>
        <body class="min-h-screen flex items-center justify-center p-6">
            
            <!-- Success Animation Overlay -->
            <div id="successScreen">
                <div class="nexora-text">NEXORA</div>
                <p class="text-gray-400 mt-4 text-sm tracking-widest uppercase">Shop Created</p>
            </div>

            <div class="glass p-8 rounded-3xl w-full max-w-sm shadow-2xl">
                <h1 class="text-2xl font-bold text-white mb-6 text-center">Create Your Shop</h1>
                <div id="errorMsg" class="text-red-400 text-sm mb-4 hidden text-center"></div>
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
                    e.preventDefault();
                    const form = e.target;
                    const btn = document.getElementById('submitBtn');
                    btn.innerText = 'Processing...';
                    
                    const res = await fetch('/api/register', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ 
                            business: form.business.value, 
                            email: form.email.value, 
                            whatsapp: form.whatsapp.value,
                            password: form.password.value 
                        })
                    });
                    
                    if (res.ok) {
                        // Trigger the NEXORA Animation!
                        document.getElementById('successScreen').classList.add('show');
                        // Wait 3 seconds, then send them to login
                        setTimeout(() => { window.location.href = '/login'; }, 3000);
                    } else {
                        btn.innerText = 'Create Account';
                        const err = document.getElementById('errorMsg');
                        err.classList.remove('hidden');
                        err.innerText = 'Email already exists. Try another.';
                    }
                };
            </script>
        </body></html>
    `);
});

// Public Shop
app.get('/shop/:slug', (req, res) => {
    const db = getDB();
    const user = db.users.find(u => u.slug === req.params.slug);
    if (!user) return res.send('Shop not found.');
    
    const products = db.products.filter(p => p.userId === user.id);
    let productHTML = products.map(p => `
        <div class="glass p-5 rounded-xl mb-4">
            <h3 class="text-lg font-bold text-[#D4AF37]">${p.name}</h3>
            <p class="text-gray-400 mb-4">₦${p.price}</p>
            <a href="https://wa.me/${user.whatsapp}?text=Hi, I want to order ${p.name}" class="block bg-green-600 text-center p-3 rounded-lg font-bold text-white hover:bg-green-500 transition">Order on WhatsApp</a>
        </div>
    `).join('');

    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><script src="https://cdn.tailwindcss.com"></script>
        <style>body{background:#0A0A0A;color:white;} .glass{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);}</style></head>
        <body class="p-6">
            <h1 class="text-3xl font-bold text-[#D4AF37] mb-8 text-center">${user.business}</h1>
            <div class="max-w-md mx-auto">${productHTML || '<p class="text-center text-gray-500">No products yet.</p>'}</div>
        </body></html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NEXORA is live'));
