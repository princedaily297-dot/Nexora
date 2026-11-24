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

// Create database file if it doesn't exist
if (!fs.existsSync(DB)) fs.writeFileSync(DB, JSON.stringify({ users: [], products: [] }));
const getDB = () => JSON.parse(fs.readFileSync(DB));
const saveDB = (data) => fs.writeFileSync(DB, JSON.stringify(data));

// Serve your landing page!
app.use(express.static(__dirname));

// --- API ROUTES ---

// 1. Register
app.post('/api/register', async (req, res) => {
    const { business, email, password, whatsapp } = req.body;
    const db = getDB();
    if (db.users.find(u => u.email === email)) return res.send('Email already exists. <a href="/register">Try again</a>');
    
    const hash = await bcrypt.hash(password, 10);
    const slug = business.toLowerCase().replace(/[^a-z0-9]/g, '');
    db.users.push({ id: Date.now(), business, email, password: hash, slug, whatsapp });
    saveDB(db);
    res.redirect('/login');
});

// 2. Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const db = getDB();
    const user = db.users.find(u => u.email === email);
    if (!user || !(await bcrypt.compare(password, user.password))) return res.send('Invalid login. <a href="/login">Try again</a>');
    
    const token = jwt.sign({ id: user.id }, SECRET);
    res.cookie('token', token, { httpOnly: true });
    res.redirect('/dashboard');
});

// 3. Logout
app.get('/logout', (req, res) => { res.clearCookie('token'); res.redirect('/'); });

// Check if logged in
const auth = (req, res, next) => {
    if (!req.cookies.token) return res.redirect('/login');
    try { req.userId = jwt.verify(req.cookies.token, SECRET).id; next(); }
    catch { res.redirect('/login'); }
};

// 4. Dashboard (Protected)
app.get('/dashboard', auth, (req, res) => {
    const db = getDB();
    const user = db.users.find(u => u.id === req.userId);
    const myProducts = db.products.filter(p => p.userId === user.id);
    let productHTML = myProducts.map(p => `<div class="border border-gray-700 p-4 mb-2 rounded"><h3 class="text-[#D4AF37]">${p.name}</h3><p class="text-gray-400">₦${p.price}</p></div>`).join('');

    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-900 text-white p-6">
            <h1 class="text-2xl font-bold text-[#D4AF37] mb-2">${user.business} Dashboard</h1>
            <p class="mb-6">Your Shop Link: <a href="/shop/${user.slug}" class="text-blue-400 underline">/shop/${user.slug}</a></p>
            
            <div class="bg-gray-800 p-4 rounded mb-8">
                <h2 class="text-xl mb-3">Add Product</h2>
                <form action="/api/products" method="POST" class="flex flex-col gap-3">
                    <input name="name" placeholder="Product Name" class="p-3 text-black rounded" required>
                    <input name="price" type="number" placeholder="Price (₦)" class="p-3 text-black rounded" required>
                    <button class="bg-[#D4AF37] text-black p-3 rounded font-bold">Add to Catalog</button>
                </form>
            </div>

            <div><h2 class="text-xl mb-3">My Catalog</h2>${productHTML || '<p>No products yet.</p>'}</div>
            <a href="/logout" class="block mt-10 text-red-400">Logout</a>
        </body></html>
    `);
});

// 5. Add Product (API)
app.post('/api/products', auth, (req, res) => {
    const { name, price } = req.body;
    const db = getDB();
    db.products.push({ id: Date.now(), userId: req.userId, name, price });
    saveDB(db);
    res.redirect('/dashboard');
});

// 6. Login & Register Pages
app.get('/login', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-900 text-white p-6 flex flex-col items-center pt-20">
            <h1 class="text-3xl font-bold text-[#D4AF37] mb-6">Login</h1>
            <form action="/api/login" method="POST" class="flex flex-col gap-4 w-full max-w-sm">
                <input name="email" type="email" placeholder="Email" class="p-3 text-black rounded" required>
                <input name="password" type="password" placeholder="Password" class="p-3 text-black rounded" required>
                <button class="bg-[#D4AF37] text-black p-3 rounded font-bold">Login</button>
            </form>
            <p class="mt-4 text-sm">No account? <a href="/register" class="text-[#D4AF37]">Register</a></p>
        </body></html>
    `);
});

app.get('/register', (req, res) => {
    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-900 text-white p-6 flex flex-col items-center pt-10">
            <h1 class="text-3xl font-bold text-[#D4AF37] mb-6">Create Shop</h1>
            <form action="/api/register" method="POST" class="flex flex-col gap-4 w-full max-w-sm">
                <input name="business" placeholder="Business Name" class="p-3 text-black rounded" required>
                <input name="email" type="email" placeholder="Email" class="p-3 text-black rounded" required>
                <input name="whatsapp" placeholder="WhatsApp (e.g. 2348012345678)" class="p-3 text-black rounded" required>
                <input name="password" type="password" placeholder="Password" class="p-3 text-black rounded" required>
                <button class="bg-[#D4AF37] text-black p-3 rounded font-bold">Create Account</button>
            </form>
            <p class="mt-4 text-sm">Have an account? <a href="/login" class="text-[#D4AF37]">Login</a></p>
        </body></html>
    `);
});

// 7. Public Storefront
app.get('/shop/:slug', (req, res) => {
    const db = getDB();
    const user = db.users.find(u => u.slug === req.params.slug);
    if (!user) return res.send('Shop not found.');
    
    const products = db.products.filter(p => p.userId === user.id);
    let productHTML = products.map(p => `
        <div class="border border-gray-700 p-4 rounded-lg mb-4 bg-gray-800">
            <h3 class="text-lg font-bold text-[#D4AF37]">${p.name}</h3>
            <p class="text-gray-400 mb-4">₦${p.price}</p>
            <a href="https://wa.me/${user.whatsapp}?text=Hi, I want to order ${p.name}" class="block bg-green-600 text-center p-2 rounded font-bold text-white">Order on WhatsApp</a>
        </div>
    `).join('');

    res.send(`
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gray-900 text-white p-6">
            <h1 class="text-3xl font-bold text-[#D4AF37] mb-8 text-center">${user.business}</h1>
            <div class="max-w-md mx-auto">${productHTML || '<p class="text-center">No products yet.</p>'}</div>
        </body></html>
    `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('NEXORA is live'));
