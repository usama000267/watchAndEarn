const Database = require("better-sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "watch_earn.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

// ================= USERS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        mobile TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        wallet_balance REAL DEFAULT 0,
        activation_status TEXT DEFAULT 'inactive',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();


// ================= ACTIVATION PAYMENTS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS activation_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL DEFAULT 1500,
        payment_method TEXT,
        transaction_reference TEXT,
        screenshot_path TEXT,
        status TEXT DEFAULT 'pending',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`).run();


// ================= VIDEO TASKS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS video_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        youtube_url TEXT NOT NULL,
        reward REAL NOT NULL DEFAULT 100,
        duration_minutes INTEGER NOT NULL DEFAULT 15,
        task_date TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`).run();


// ================= VIDEO WATCHES =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS video_watches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        video_id INTEGER NOT NULL,
        started_at DATETIME,
        completed_at DATETIME,
        reward REAL DEFAULT 0,
        status TEXT DEFAULT 'started',
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (video_id) REFERENCES video_tasks(id)
    )
`).run();


// ================= WITHDRAWALS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        account_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`).run();

// ================= DEPOSITS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_reference TEXT NOT NULL,
        screenshot_path TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`).run();
// ================= REFERRALS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL UNIQUE,
        signup_bonus REAL DEFAULT 500,
        earning_percentage REAL DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id),
        FOREIGN KEY (referred_user_id) REFERENCES users(id)
    )
`).run();


// ================= TRANSACTIONS =================

db.prepare(`
    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`).run();


console.log("Watch & Earn database initialized successfully.");

module.exports = db;