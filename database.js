require("dotenv").config();
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL is missing.");
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            full_name TEXT NOT NULL,
            username TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            mobile TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            wallet_balance NUMERIC DEFAULT 0,
            activation_status TEXT DEFAULT 'inactive',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS activation_payments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            amount NUMERIC NOT NULL DEFAULT 1500,
            payment_method TEXT,
            transaction_reference TEXT,
            screenshot_path TEXT,
            status TEXT DEFAULT 'pending',
            submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS video_tasks (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            youtube_url TEXT NOT NULL,
            reward NUMERIC NOT NULL DEFAULT 100,
            duration_minutes INTEGER NOT NULL DEFAULT 15,
            task_date TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS video_watches (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            video_id INTEGER NOT NULL REFERENCES video_tasks(id),
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            reward NUMERIC DEFAULT 0,
            status TEXT DEFAULT 'started'
        );

        CREATE TABLE IF NOT EXISTS withdrawals (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            amount NUMERIC NOT NULL,
            method TEXT NOT NULL,
            account_number TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS deposits (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            amount NUMERIC NOT NULL,
            payment_method TEXT NOT NULL,
            transaction_reference TEXT NOT NULL,
            screenshot_path TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS referrals (
            id SERIAL PRIMARY KEY,
            referrer_id INTEGER NOT NULL REFERENCES users(id),
            referred_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
            signup_bonus NUMERIC DEFAULT 500,
            earning_percentage NUMERIC DEFAULT 10,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transactions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS wallet_settlements (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            transaction_id INTEGER REFERENCES transactions(id),
            amount NUMERIC NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            settled_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            settled_at TIMESTAMP
        );
    `);

    console.log("PostgreSQL database initialized successfully.");
}

initDatabase().catch((error) => {
    console.error("DATABASE INITIALIZATION ERROR:", error);
    process.exit(1);
});

module.exports = pool;