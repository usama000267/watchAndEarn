const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
/* =========================================================
   ACTIVATION UPLOADS
========================================================= */

const uploadDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },

    filename: function (req, file, cb) {
        const extension =
            path.extname(file.originalname);

        const filename =
            "activation-" +
            Date.now() +
            "-" +
            Math.round(Math.random() * 1000000) +
            extension;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        if (file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(
                new Error("Only image files are allowed.")
            );
        }
    }
});
/* =========================================================
   CONFIG
========================================================= */

const ADMIN_EMAIL = "admin@watchandearn.com";
const ADMIN_PASSWORD = "Admin@12345";

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: "watch-and-earn-secret-change-this",
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   PAGES
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin.html"));
});

/* =========================================================
   AUTH HELPERS
========================================================= */

function requireUser(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "Please login first."
        });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({
            success: false,
            message: "Admin login required."
        });
    }

    next();
}

/* =========================================================
   SERVER STATUS
========================================================= */

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Watch & Earn server is running."
    });
});

/* =========================================================
   REGISTER
========================================================= */
app.get("/api/referrals", requireUser, (req, res) => {
    try {

        const userId = req.session.user.id;

        const user = db.prepare(`
            SELECT username
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const referrals = db.prepare(`
            SELECT
                r.id,
                r.signup_bonus,
                r.earning_percentage,
                r.created_at,
                u.username,
                u.full_name
            FROM referrals r
            JOIN users u
                ON u.id = r.referred_user_id
            WHERE r.referrer_id = ?
            ORDER BY r.id DESC
        `).all(userId);


        const history = db.prepare(`
            SELECT
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = ?
            AND type = 'referral'
            ORDER BY id DESC
        `).all(userId);


        const totalEarnings = history.reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );


        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const referralLink =
            `${baseUrl}/register.html?ref=${encodeURIComponent(user.username)}`;


        res.json({
            success: true,

            referral_link:
                referralLink,

            total_referrals:
                referrals.length,

            total_earnings:
                totalEarnings,

            history:
                history
        });


    } catch (error) {

        console.error(
            "REFERRALS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load referral information."
        });
    }
});app.get("/api/referrals", requireUser, (req, res) => {
    try {

        const userId = req.session.user.id;

        const user = db.prepare(`
            SELECT username
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const referrals = db.prepare(`
            SELECT
                r.id,
                r.signup_bonus,
                r.earning_percentage,
                r.created_at,
                u.username,
                u.full_name
            FROM referrals r
            JOIN users u
                ON u.id = r.referred_user_id
            WHERE r.referrer_id = ?
            ORDER BY r.id DESC
        `).all(userId);


        const history = db.prepare(`
            SELECT
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = ?
            AND type = 'referral'
            ORDER BY id DESC
        `).all(userId);


        const totalEarnings = history.reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );


        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const referralLink =
            `${baseUrl}/register.html?ref=${encodeURIComponent(user.username)}`;


        res.json({
            success: true,

            referral_link:
                referralLink,

            total_referrals:
                referrals.length,

            total_earnings:
                totalEarnings,

            history:
                history
        });


    } catch (error) {

        console.error(
            "REFERRALS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load referral information."
        });
    }
});app.get("/api/referrals", requireUser, (req, res) => {
    try {

        const userId = req.session.user.id;

        const user = db.prepare(`
            SELECT username
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const referrals = db.prepare(`
            SELECT
                r.id,
                r.signup_bonus,
                r.earning_percentage,
                r.created_at,
                u.username,
                u.full_name
            FROM referrals r
            JOIN users u
                ON u.id = r.referred_user_id
            WHERE r.referrer_id = ?
            ORDER BY r.id DESC
        `).all(userId);


        const history = db.prepare(`
            SELECT
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = ?
            AND type = 'referral'
            ORDER BY id DESC
        `).all(userId);


        const totalEarnings = history.reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );


        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const referralLink =
            `${baseUrl}/register.html?ref=${encodeURIComponent(user.username)}`;


        res.json({
            success: true,

            referral_link:
                referralLink,

            total_referrals:
                referrals.length,

            total_earnings:
                totalEarnings,

            history:
                history
        });


    } catch (error) {

        console.error(
            "REFERRALS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load referral information."
        });
    }
});
/* =========================================================
   USER REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {

    try {

        const {
            full_name,
            username,
            email,
            mobile,
            password,
            referral
        } = req.body;


        /* ================= VALIDATION ================= */

        if (
            !full_name ||
            !username ||
            !email ||
            !mobile ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required."
            });
        }


        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 8 characters."
            });
        }


        /* ================= CHECK EXISTING USER ================= */

        const existingUser = db.prepare(`
            SELECT id
            FROM users
            WHERE username = ?
               OR email = ?
        `).get(
            username,
            email
        );


        if (existingUser) {
            return res.status(400).json({
                success: false,
                message:
                    "Username or email already exists."
            });
        }


        /* ================= PASSWORD ================= */

        const passwordHash =
            await bcrypt.hash(password, 10);


        /* ================= CREATE USER ================= */

        const createUser =
            db.transaction(() => {

                const result = db.prepare(`
                    INSERT INTO users
                    (
                        full_name,
                        username,
                        email,
                        mobile,
                        password_hash,
                        wallet_balance,
                        activation_status
                    )
                    VALUES (?, ?, ?, ?, ?, 0, 'inactive')
                `).run(
                    full_name,
                    username,
                    email,
                    mobile,
                    passwordHash
                );


                const newUserId =
                    result.lastInsertRowid;


                /* ================= REFERRAL ================= */

                if (referral) {

                    const referrer =
                        db.prepare(`
                            SELECT id
                            FROM users
                            WHERE username = ?
                        `).get(referral);


                    if (
                        referrer &&
                        Number(referrer.id) !==
                        Number(newUserId)
                    ) {

                        db.prepare(`
                            INSERT INTO referrals
                            (
                                referrer_id,
                                referred_user_id,
                                signup_bonus,
                                earning_percentage
                            )
                            VALUES (?, ?, 500, 10)
                        `).run(
                            referrer.id,
                            newUserId
                        );


                        /* ================= BONUS ================= */

                        db.prepare(`
                            UPDATE users
                            SET wallet_balance =
                                wallet_balance + 500
                            WHERE id = ?
                        `).run(
                            referrer.id
                        );


                        /* ================= TRANSACTION ================= */

                        db.prepare(`
                            INSERT INTO transactions
                            (
                                user_id,
                                type,
                                amount,
                                description
                            )
                            VALUES (?, ?, ?, ?)
                        `).run(
                            referrer.id,
                            "referral",
                            500,
                            "Referral signup bonus"
                        );

                    }
                }


                return newUserId;
            });


        const userId =
            createUser();


        /* ================= SUCCESS ================= */

        res.status(201).json({
            success: true,
            message:
                "Account created successfully.",
            user_id:
                userId
        });


    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );


        res.status(500).json({
            success: false,
            message:
                "Unable to create account."
        });
    }

});
/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(email);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const validPassword =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email
        };

        res.json({
            success: true,
            message: "Login successful.",
            user: {
                id: user.id,
                full_name: user.full_name,
                username: user.username,
                email: user.email,
                mobile: user.mobile,
                wallet_balance:
                    Number(user.wallet_balance || 0),
                activation_status:
                    user.activation_status
            }
        });

    } catch (error) {
        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to login."
        });
    }
});

/* =========================================================
   USER SESSION
========================================================= */

app.get("/api/me", requireUser, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT
                id,
                full_name,
                username,
                email,
                mobile,
                wallet_balance,
                activation_status,
                created_at
            FROM users
            WHERE id = ?
        `).get(req.session.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        res.json({
            success: true,
            user: {
                ...user,
                wallet_balance:
                    Number(user.wallet_balance || 0)
            }
        });

    } catch (error) {
        console.error("ME ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load account."
        });
    }
});

/* =========================================================
   USER LOGOUT
========================================================= */

app.post("/api/logout", requireUser, (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

/* =========================================================
   WALLET
========================================================= */

app.get("/api/wallet", requireUser, (req, res) => {
    try {
        const user = db.prepare(`
            SELECT
                wallet_balance,
                activation_status
            FROM users
            WHERE id = ?
        `).get(req.session.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        res.json({
            success: true,
            wallet: {
                wallet_balance:
                    Number(user.wallet_balance || 0),
                activation_status:
                    user.activation_status
            }
        });

    } catch (error) {
        console.error("WALLET ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load wallet."
        });
    }
});

/* =========================================================
   TRANSACTION HISTORY
========================================================= */

app.get("/api/history", requireUser, (req, res) => {
    try {
        const transactions = db.prepare(`
            SELECT
                id,
                type,
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = ?
            ORDER BY id DESC
        `).all(req.session.user.id);

        res.json({
            success: true,
            transactions
        });

    } catch (error) {
        console.error("HISTORY ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load transaction history."
        });
    }
});
/* =========================================================
   REFERRAL DATA
========================================================= */
app.get("/api/referrals", requireUser, (req, res) => {
    try {

        const userId = req.session.user.id;

        const user = db.prepare(`
            SELECT username
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const referrals = db.prepare(`
            SELECT
                r.id,
                r.signup_bonus,
                r.earning_percentage,
                r.created_at,
                u.username,
                u.full_name
            FROM referrals r
            JOIN users u
                ON u.id = r.referred_user_id
            WHERE r.referrer_id = ?
            ORDER BY r.id DESC
        `).all(userId);


        const history = db.prepare(`
            SELECT
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = ?
            AND type = 'referral'
            ORDER BY id DESC
        `).all(userId);


        const totalEarnings = history.reduce(
            (total, item) =>
                total + Number(item.amount || 0),
            0
        );


        const baseUrl =
            `${req.protocol}://${req.get("host")}`;

        const referralLink =
            `${baseUrl}/register.html?ref=${encodeURIComponent(user.username)}`;


        res.json({
            success: true,

            referral_link:
                referralLink,

            total_referrals:
                referrals.length,

            total_earnings:
                totalEarnings,

            history:
                history
        });


    } catch (error) {

        console.error(
            "REFERRALS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load referral information."
        });
    }
});
/* =========================================================
   GET TODAY VIDEO TASKS
========================================================= */

app.get("/api/tasks", requireUser, (req, res) => {

    try {

        const today =
            new Date().toISOString().slice(0, 10);

        const tasks = db.prepare(`
            SELECT
                id,
                title,
                youtube_url,
                reward,
                duration_minutes,
                task_date,
                is_active
            FROM video_tasks
            WHERE is_active = 1
            AND task_date = ?
            ORDER BY id DESC
        `).all(today);


        res.json({
            success: true,
            tasks
        });


    } catch (error) {

        console.error(
            "TASKS ERROR:",
            error
        );


        res.status(500).json({
            success: false,
            message:
                "Unable to load video tasks."
        });

    }

});
/* =========================================================
   START VIDEO TASK
========================================================= */

app.post("/api/tasks/:id/start", requireUser, (req, res) => {

    try {

        const taskId = Number(req.params.id);
        const userId = req.session.user.id;

        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Invalid video task."
            });
        }

        /* ================= GET TODAY ================= */

        const today =
            new Date().toISOString().slice(0, 10);

        /* ================= GET TASK ================= */

        const task = db.prepare(`
            SELECT *
            FROM video_tasks
            WHERE id = ?
            AND is_active = 1
            AND task_date = ?
        `).get(taskId, today);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Video task not found or inactive."
            });
        }

        /* ================= CHECK EXISTING WATCH ================= */

        let watch = db.prepare(`
            SELECT *
            FROM video_watches
            WHERE user_id = ?
            AND video_id = ?
            ORDER BY id DESC
            LIMIT 1
        `).get(userId, taskId);

        /* ================= ALREADY CLAIMED ================= */

        if (watch && watch.status === "claimed") {
            return res.json({
                success: true,
                status: "claimed",
                remaining_seconds: 0,
                reward: Number(task.reward)
            });
        }

        /* ================= ALREADY COMPLETED ================= */

        if (watch && watch.status === "completed") {
            return res.json({
                success: true,
                status: "completed",
                remaining_seconds: 0,
                reward: Number(task.reward)
            });
        }

        /* ================= EXISTING START ================= */

        if (watch && watch.status === "started") {

            const startedTime =
                new Date(
                    watch.started_at.replace(" ", "T") + "Z"
                ).getTime();

            const elapsed =
                Math.floor(
                    (Date.now() - startedTime) / 1000
                );

            const totalSeconds =
                Number(task.duration_minutes) * 60;

            const remaining =
                Math.max(
                    totalSeconds - elapsed,
                    0
                );

            if (remaining <= 0) {

                db.prepare(`
                    UPDATE video_watches
                    SET
                        status = 'completed',
                        completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(watch.id);

                return res.json({
                    success: true,
                    status: "completed",
                    remaining_seconds: 0,
                    reward: Number(task.reward)
                });
            }

            return res.json({
                success: true,
                status: "started",
                remaining_seconds: remaining,
                reward: Number(task.reward),
                youtube_url: task.youtube_url
            });
        }

        /* ================= CREATE NEW WATCH ================= */

        const result = db.prepare(`
            INSERT INTO video_watches
            (
                user_id,
                video_id,
                started_at,
                reward,
                status
            )
            VALUES (?, ?, CURRENT_TIMESTAMP, ?, 'started')
        `).run(
            userId,
            taskId,
            Number(task.reward)
        );

        /* ================= RESPONSE ================= */

        const totalSeconds =
            Number(task.duration_minutes) * 60;

        res.json({
            success: true,
            status: "started",
            watch_id: result.lastInsertRowid,
            remaining_seconds: totalSeconds,
            reward: Number(task.reward),
            youtube_url: task.youtube_url
        });

    } catch (error) {

        console.error(
            "START VIDEO ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to start video task."
        });
    }

});
/* =========================================================
   VIDEO STATUS
========================================================= */

app.get("/api/tasks/:id/status", requireUser, (req, res) => {
    try {
        const taskId =
            Number(req.params.id);

        const userId =
            req.session.user.id;

        const task = db.prepare(`
            SELECT *
            FROM video_tasks
            WHERE id = ?
        `).get(taskId);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Task not found."
            });
        }

        const watch = db.prepare(`
            SELECT *
            FROM video_watches
            WHERE user_id = ?
            AND video_id = ?
            ORDER BY id DESC
            LIMIT 1
        `).get(userId, taskId);

        if (!watch) {
            return res.json({
                success: true,
                status: "not_started",
                remaining_seconds:
                    Number(task.duration_minutes) * 60
            });
        }

        if (watch.status === "claimed") {
            return res.json({
                success: true,
                status: "claimed",
                remaining_seconds: 0,
                reward: Number(watch.reward || task.reward)
            });
        }

        if (watch.status === "completed") {
            return res.json({
                success: true,
                status: "completed",
                remaining_seconds: 0,
                reward: Number(task.reward)
            });
        }

        if (watch.status === "started") {

            const startedTime =
                new Date(
                    watch.started_at.replace(" ", "T") + "Z"
                ).getTime();

            const elapsed =
                Math.floor(
                    (Date.now() - startedTime) / 1000
                );

            const totalSeconds =
                Number(task.duration_minutes) * 60;

            const remaining =
                Math.max(
                    totalSeconds - elapsed,
                    0
                );

            if (remaining <= 0) {

                db.prepare(`
                    UPDATE video_watches
                    SET
                        status = 'completed',
                        completed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(watch.id);

                return res.json({
                    success: true,
                    status: "completed",
                    remaining_seconds: 0,
                    reward: Number(task.reward)
                });
            }

            return res.json({
                success: true,
                status: "started",
                remaining_seconds: remaining
            });
        }

        res.json({
            success: true,
            status: "not_started"
        });

    } catch (error) {
        console.error("VIDEO STATUS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to check video status."
        });
    }
});

/* =========================================================
   CLAIM VIDEO REWARD
   IMPORTANT:
   This is the ONLY claim endpoint.
========================================================= */

app.post("/api/tasks/:id/claim", requireUser, (req, res) => {
    try {
        const taskId =
            Number(req.params.id);

        const userId =
            req.session.user.id;

        if (!taskId) {
            return res.status(400).json({
                success: false,
                message: "Invalid video."
            });
        }

        const task = db.prepare(`
            SELECT *
            FROM video_tasks
            WHERE id = ?
            AND is_active = 1
        `).get(taskId);

        if (!task) {
            return res.status(404).json({
                success: false,
                message: "Video task not found."
            });
        }

        const watch = db.prepare(`
            SELECT *
            FROM video_watches
            WHERE user_id = ?
            AND video_id = ?
            ORDER BY id DESC
            LIMIT 1
        `).get(userId, taskId);

        if (!watch) {
            return res.status(400).json({
                success: false,
                message: "Please watch the video first."
            });
        }

        if (watch.status === "claimed") {
            return res.status(400).json({
                success: false,
                message: "Reward already claimed."
            });
        }

        /*
         * ACTUAL SERVER-SIDE WATCH TIME CHECK
         */

        const startedTime =
            new Date(
                watch.started_at.replace(" ", "T") + "Z"
            ).getTime();

        const elapsed =
            Math.floor(
                (Date.now() - startedTime) / 1000
            );

        const requiredSeconds =
            Number(task.duration_minutes) * 60;

        if (elapsed < requiredSeconds) {

            const remaining =
                requiredSeconds - elapsed;

            return res.status(400).json({
                success: false,
                message:
                    `Please complete the video first. ${remaining} seconds remaining.`,
                remaining_seconds: remaining
            });
        }

        const reward =
            Number(task.reward);

        if (
            !Number.isFinite(reward) ||
            reward <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid reward amount."
            });
        }

        /*
         * ONE ATOMIC TRANSACTION
         */

        const transaction =
            db.transaction(() => {

                const freshWatch = db.prepare(`
                    SELECT *
                    FROM video_watches
                    WHERE id = ?
                `).get(watch.id);

                if (
                    !freshWatch ||
                    freshWatch.status === "claimed"
                ) {
                    throw new Error(
                        "Reward has already been claimed."
                    );
                }

                db.prepare(`
                    UPDATE video_watches
                    SET
                        status = 'claimed',
                        completed_at = CURRENT_TIMESTAMP,
                        reward = ?
                    WHERE id = ?
                `).run(
                    reward,
                    watch.id
                );

                db.prepare(`
                    UPDATE users
                    SET wallet_balance =
                        COALESCE(wallet_balance, 0) + ?
                    WHERE id = ?
                `).run(
                    reward,
                    userId
                );

                db.prepare(`
                    INSERT INTO transactions
                    (
                        user_id,
                        type,
                        amount,
                        description
                    )
                    VALUES (?, ?, ?, ?)
                `).run(
                    userId,
                    "earning",
                    reward,
                    "Video task reward claimed"
                );
            });

        transaction();

        const updatedUser =
            db.prepare(`
                SELECT wallet_balance
                FROM users
                WHERE id = ?
            `).get(userId);

        res.json({
            success: true,
            message:
                `Congratulations! Rs. ${reward.toFixed(2)} has been added to your wallet.`,
            reward,
            wallet_balance:
                Number(updatedUser.wallet_balance || 0)
        });

    } catch (error) {
        console.error("CLAIM ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to claim reward."
        });
    }
});

/* =========================================================
   WITHDRAWAL
========================================================= */

app.post("/api/withdrawals", requireUser, (req, res) => {
    try {
        const {
            amount,
            method,
            account_number
        } = req.body;

        const userId =
            req.session.user.id;

        const withdrawAmount =
            Number(amount);

        if (
            !Number.isFinite(withdrawAmount) ||
            withdrawAmount <= 0 ||
            !method ||
            !account_number
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Valid amount, method and account number are required."
            });
        }

        const user = db.prepare(`
            SELECT
                wallet_balance,
                activation_status
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (user.activation_status !== "active") {
            return res.status(403).json({
                success: false,
                code: "ACCOUNT_NOT_ACTIVATED",
                message:
                    "Please activate your account before withdrawing."
            });
        }

        if (
            withdrawAmount >
            Number(user.wallet_balance || 0)
        ) {
            return res.status(400).json({
                success: false,
                message: "Insufficient wallet balance."
            });
        }

        const transaction =
            db.transaction(() => {

                db.prepare(`
                    INSERT INTO withdrawals
                    (
                        user_id,
                        amount,
                        method,
                        account_number,
                        status
                    )
                    VALUES (?, ?, ?, ?, 'pending')
                `).run(
                    userId,
                    withdrawAmount,
                    method,
                    account_number
                );

                db.prepare(`
                    UPDATE users
                    SET wallet_balance =
                        wallet_balance - ?
                    WHERE id = ?
                `).run(
                    withdrawAmount,
                    userId
                );

                db.prepare(`
                    INSERT INTO transactions
                    (
                        user_id,
                        type,
                        amount,
                        description
                    )
                    VALUES (?, ?, ?, ?)
                `).run(
                    userId,
                    "withdrawal_request",
                    withdrawAmount,
                    "Withdrawal request submitted"
                );
            });

        transaction();

        const updatedUser =
            db.prepare(`
                SELECT wallet_balance
                FROM users
                WHERE id = ?
            `).get(userId);

        res.json({
            success: true,
            message:
                "Withdrawal request submitted successfully.",
            wallet_balance:
                Number(updatedUser.wallet_balance || 0)
        });

    } catch (error) {
        console.error("WITHDRAW ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to submit withdrawal."
        });
    }
});
/* =========================================================
   USER DEPOSIT REQUEST
========================================================= */

app.post(
    "/api/deposits",
    requireUser,
    upload.single("payment_proof"),
    (req, res) => {

        try {

            const userId =
                req.session.user.id;

            const {
                amount,
                payment_method,
                reference
            } = req.body;


            /* ================= VALIDATION ================= */

            const depositAmount =
                Number(amount);

            if (
                !Number.isFinite(depositAmount) ||
                depositAmount <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid deposit amount."
                });

            }


            if (!payment_method) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a payment method."
                });

            }


            if (!reference) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment reference is required."
                });

            }


            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment screenshot is required."
                });

            }


            /* ================= SAVE SCREENSHOT ================= */

            const screenshotPath =
                "/uploads/" + req.file.filename;


            /* ================= SAVE DEPOSIT ================= */

            const result = db.prepare(`
                INSERT INTO deposits
                (
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    screenshot_path,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'pending')
            `).run(
                userId,
                depositAmount,
                payment_method,
                reference,
                screenshotPath
            );


            /* ================= TRANSACTION HISTORY ================= */

            db.prepare(`
                INSERT INTO transactions
                (
                    user_id,
                    type,
                    amount,
                    description
                )
                VALUES (?, ?, ?, ?)
            `).run(
                userId,
                "deposit_pending",
                depositAmount,
                "Deposit request submitted"
            );


            /* ================= SUCCESS ================= */

            res.status(201).json({

                success: true,

                message:
                    "Deposit request submitted successfully.",

                request_id:
                    result.lastInsertRowid

            });


        } catch (error) {

            console.error(
                "DEPOSIT REQUEST ERROR:",
                error
            );


            res.status(500).json({

                success: false,

                message:
                    "Unable to submit deposit request."

            });

        }

    }
);
/*
/* =========================================================
   USER WITHDRAWAL HISTORY
========================================================= */

app.get("/api/withdrawals", requireUser, (req, res) => {
    try {

        const userId = req.session.user.id;

        const withdrawals = db.prepare(`
            SELECT
                id,
                amount,
                method,
                account_number,
                status,
                created_at
            FROM withdrawals
            WHERE user_id = ?
            ORDER BY id DESC
        `).all(userId);

        res.json({
            success: true,
            withdrawals
        });

    } catch (error) {

        console.error(
            "USER WITHDRAWAL HISTORY ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load withdrawal history."
        });
    }
});
/*
 =========================================================
   ADMIN LOGIN
========================================================= */

app.post("/api/admin/login", (req, res) => {
    try {
        const {
            email,
            password
        } = req.body;

        if (
            email !== ADMIN_EMAIL ||
            password !== ADMIN_PASSWORD
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid admin credentials."
            });
        }

        req.session.admin = true;

        res.json({
            success: true,
            message: "Admin login successful."
        });

    } catch (error) {
        console.error("ADMIN LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Admin login failed."
        });
    }
});

/* =========================================================
   ADMIN LOGOUT
========================================================= */

app.post("/api/admin/logout", requireAdmin, (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true,
            message: "Admin logged out."
        });
    });
});

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
    try {
        const totalUsers =
            db.prepare(`
                SELECT COUNT(*) AS count
                FROM users
            `).get().count;

        const activeUsers =
            db.prepare(`
                SELECT COUNT(*) AS count
                FROM users
                WHERE activation_status = 'active'
            `).get().count;

        const pendingActivations =
            db.prepare(`
                SELECT COUNT(*) AS count
                FROM activation_payments
                WHERE status = 'pending'
            `).get().count;

        const pendingWithdrawals =
            db.prepare(`
                SELECT COUNT(*) AS count
                FROM withdrawals
                WHERE status = 'pending'
            `).get().count;

        res.json({
            success: true,
            totalUsers,
            activeUsers,
            pendingActivations,
            pendingWithdrawals
        });

    } catch (error) {
        console.error("ADMIN DASHBOARD ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load admin dashboard."
        });
    }
});

/* =========================================================
   ADMIN USERS
========================================================= */

app.get("/api/admin/users", requireAdmin, (req, res) => {
    try {
        const users = db.prepare(`
            SELECT
                id,
                full_name,
                username,
                email,
                mobile,
                wallet_balance,
                activation_status,
                created_at
            FROM users
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            users
        });

    } catch (error) {
        console.error("ADMIN USERS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load users."
        });
    }
});

/* =========================================================
   ADMIN VIDEOS
========================================================= */

app.post("/api/admin/videos", requireAdmin, (req, res) => {
    try {
        const {
            title,
            youtube_url,
            reward,
            duration_minutes
        } = req.body;

        if (
            !title ||
            !youtube_url ||
            !reward ||
            !duration_minutes
        ) {
            return res.status(400).json({
                success: false,
                message: "All video fields are required."
            });
        }

        const today =
            new Date().toISOString().slice(0, 10);

        const result = db.prepare(`
            INSERT INTO video_tasks
            (
                title,
                youtube_url,
                reward,
                duration_minutes,
                task_date,
                is_active
            )
            VALUES (?, ?, ?, ?, ?, 1)
        `).run(
            title,
            youtube_url,
            Number(reward),
            Number(duration_minutes),
            today
        );

        res.json({
            success: true,
            message: "Video added successfully.",
            id: result.lastInsertRowid
        });

    } catch (error) {
        console.error("ADD VIDEO ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to add video."
        });
    }
});

app.get("/api/admin/videos", requireAdmin, (req, res) => {
    try {
        const videos = db.prepare(`
            SELECT
                id,
                title,
                youtube_url,
                reward,
                duration_minutes,
                task_date,
                is_active,
                created_at
            FROM video_tasks
            ORDER BY id DESC
        `).all();

        res.json({
            success: true,
            videos
        });

    } catch (error) {
        console.error("ADMIN VIDEOS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Unable to load videos."
        });
    }
});
/* =========================================================
   USER ACTIVATION REQUEST
========================================================= */

app.post(
    "/api/activation/request",
    requireUser,
    upload.single("payment_proof"),
    (req, res) => {

        try {

            const userId =
                req.session.user.id;

            const {
                payment_method,
                reference
            } = req.body;


            /* ================= VALIDATION ================= */

            if (!payment_method) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please select a payment method."
                });

            }


            if (!reference) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment reference is required."
                });

            }


            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Payment screenshot is required."
                });

            }


            /* ================= USER ================= */

            const user = db.prepare(`
                SELECT
                    id,
                    activation_status
                FROM users
                WHERE id = ?
            `).get(userId);


            if (!user) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found."
                });

            }


            if (user.activation_status === "active") {

                return res.status(400).json({
                    success: false,
                    message:
                        "Your account is already activated."
                });

            }


            /* ================= CHECK PENDING ================= */

            const pendingRequest = db.prepare(`
                SELECT id
                FROM activation_payments
                WHERE user_id = ?
                AND status = 'pending'
                LIMIT 1
            `).get(userId);


            if (pendingRequest) {

                return res.status(400).json({
                    success: false,
                    message:
                        "You already have a pending activation request."
                });

            }


            /* ================= AMOUNT ================= */

            let amount = 1500;

            if (payment_method === "bep20") {
                amount = 5.30;
            }

            if (payment_method === "trc20") {
                amount = 5.50;
            }


            /* ================= SAVE REQUEST ================= */

            const screenshotPath =
                "/uploads/" + req.file.filename;


            const result = db.prepare(`
                INSERT INTO activation_payments
                (
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    screenshot_path,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'pending')
            `).run(
                userId,
                amount,
                payment_method,
                reference,
                screenshotPath
            );


            /* ================= SUCCESS ================= */

            res.status(201).json({
                success: true,
                message:
                    "Activation request submitted successfully.",
                request_id:
                    result.lastInsertRowid
            });


        } catch (error) {

            console.error(
                "ACTIVATION REQUEST ERROR:",
                error
            );


            res.status(500).json({
                success: false,
                message:
                    "Unable to submit activation request."
            });

        }

    }
);
/* =========================================================
   ADMIN ACTIVATION PAYMENTS
========================================================= */

app.get(
    "/api/admin/activation-payments",
    requireAdmin,
    (req, res) => {

        try {

            const payments = db.prepare(`
                SELECT
                    ap.id,
                    ap.user_id,
                    ap.amount,
                    ap.payment_method,
                    ap.transaction_reference,
                    ap.screenshot_path,
                    ap.status,
                    ap.submitted_at,
                    u.username,
                    u.full_name,
                    u.email
                FROM activation_payments ap
                JOIN users u
                    ON u.id = ap.user_id
                ORDER BY ap.id DESC
            `).all();

            res.json({
                success: true,
                payments
            });

        } catch (error) {

            console.error(
                "ACTIVATION PAYMENTS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load activation requests."
            });
        }
    }
);

/* =========================================================
   ADMIN APPROVE ACTIVATION
========================================================= */

app.post(
    "/api/admin/activation-payments/:id/approve",
    requireAdmin,
    (req, res) => {

        try {

            const paymentId =
                Number(req.params.id);

            const payment = db.prepare(`
                SELECT *
                FROM activation_payments
                WHERE id = ?
            `).get(paymentId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Activation request not found."
                });
            }

            if (payment.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message:
                        "This request has already been processed."
                });
            }

            const transaction =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE activation_payments
                        SET status = 'approved'
                        WHERE id = ?
                    `).run(paymentId);

                    db.prepare(`
                        UPDATE users
                        SET activation_status = 'active'
                        WHERE id = ?
                    `).run(payment.user_id);

                    db.prepare(`
                        INSERT INTO transactions
                        (
                            user_id,
                            type,
                            amount,
                            description
                        )
                        VALUES (?, ?, ?, ?)
                    `).run(
                        payment.user_id,
                        "activation",
                        0,
                        "Account activation approved"
                    );
                });

            transaction();

            res.json({
                success: true,
                message:
                    "Account activated successfully."
            });

        } catch (error) {

            console.error(
                "APPROVE ACTIVATION ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to approve activation."
            });
        }
    }
);

/* =========================================================
   ADMIN REJECT ACTIVATION
========================================================= */

app.post(
    "/api/admin/activation-payments/:id/reject",
    requireAdmin,
    (req, res) => {

        try {

            const paymentId =
                Number(req.params.id);

            const payment = db.prepare(`
                SELECT *
                FROM activation_payments
                WHERE id = ?
            `).get(paymentId);

            if (!payment) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Activation request not found."
                });
            }

            if (payment.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message:
                        "This request has already been processed."
                });
            }

            db.prepare(`
                UPDATE activation_payments
                SET status = 'rejected'
                WHERE id = ?
            `).run(paymentId);

            res.json({
                success: true,
                message:
                    "Activation request rejected."
            });

        } catch (error) {

            console.error(
                "REJECT ACTIVATION ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to reject activation."
            });
        }
    }
);
/* =========================================================
   USER WITHDRAWAL HISTORY
========================================================= */

app.get("/api/withdrawals/history", requireUser, (req, res) => {
    try {

        const withdrawals = db.prepare(`
            SELECT
                id,
                amount,
                method,
                account_number,
                status,
                created_at
            FROM withdrawals
            WHERE user_id = ?
            ORDER BY id DESC
        `).all(req.session.user.id);

        res.json({
            success: true,
            withdrawals
        });

    } catch (error) {

        console.error(
            "USER WITHDRAWAL HISTORY ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load withdrawal history."
        });
    }
});
/* =========================================================
   ADMIN WITHDRAWALS
========================================================= */

app.get(
    "/api/admin/withdrawals",
    requireAdmin,
    (req, res) => {

        try {

            const withdrawals = db.prepare(`
                SELECT
                    w.id,
                    w.user_id,
                    w.amount,
                    w.method,
                    w.account_number,
                    w.status,
                    w.created_at,
                    u.username,
                    u.full_name,
                    u.email
                FROM withdrawals w
                JOIN users u
                    ON u.id = w.user_id
                ORDER BY w.id DESC
            `).all();

            res.json({
                success: true,
                withdrawals
            });

        } catch (error) {

            console.error(
                "ADMIN WITHDRAWALS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load withdrawals."
            });
        }
    }
);

/* =========================================================
   ADMIN APPROVE WITHDRAWAL
========================================================= */

app.post(
    "/api/admin/withdrawals/:id/approve",
    requireAdmin,
    (req, res) => {

        try {

            const withdrawalId =
                Number(req.params.id);

            const withdrawal = db.prepare(`
                SELECT *
                FROM withdrawals
                WHERE id = ?
            `).get(withdrawalId);

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Withdrawal not found."
                });
            }

            if (withdrawal.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Withdrawal already processed."
                });
            }

            db.prepare(`
                UPDATE withdrawals
                SET status = 'approved'
                WHERE id = ?
            `).run(withdrawalId);

            db.prepare(`
                INSERT INTO transactions
                (
                    user_id,
                    type,
                    amount,
                    description
                )
                VALUES (?, ?, ?, ?)
            `).run(
                withdrawal.user_id,
                "withdrawal",
                withdrawal.amount,
                "Withdrawal approved"
            );

            res.json({
                success: true,
                message:
                    "Withdrawal approved successfully."
            });

        } catch (error) {

            console.error(
                "APPROVE WITHDRAWAL ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to approve withdrawal."
            });
        }
    }
);

/* =========================================================
   ADMIN REJECT WITHDRAWAL
========================================================= */

app.post(
    "/api/admin/withdrawals/:id/reject",
    requireAdmin,
    (req, res) => {

        try {

            const withdrawalId =
                Number(req.params.id);

            const withdrawal = db.prepare(`
                SELECT *
                FROM withdrawals
                WHERE id = ?
            `).get(withdrawalId);

            if (!withdrawal) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Withdrawal not found."
                });
            }

            if (withdrawal.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Withdrawal already processed."
                });
            }

            const transaction =
                db.transaction(() => {

                    db.prepare(`
                        UPDATE withdrawals
                        SET status = 'rejected'
                        WHERE id = ?
                    `).run(withdrawalId);

                    db.prepare(`
                        UPDATE users
                        SET wallet_balance =
                            COALESCE(wallet_balance, 0) + ?
                        WHERE id = ?
                    `).run(
                        withdrawal.amount,
                        withdrawal.user_id
                    );

                    db.prepare(`
                        INSERT INTO transactions
                        (
                            user_id,
                            type,
                            amount,
                            description
                        )
                        VALUES (?, ?, ?, ?)
                    `).run(
                        withdrawal.user_id,
                        "withdrawal_refund",
                        withdrawal.amount,
                        "Rejected withdrawal refunded"
                    );
                });

            transaction();

            res.json({
                success: true,
                message:
                    "Withdrawal rejected and refunded."
            });

        } catch (error) {

            console.error(
                "REJECT WITHDRAWAL ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to reject withdrawal."
            });
        }
    }
);

/* =========================================================
   404 API HANDLER
========================================================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

/* =========================================================
   SERVER START
========================================================= */

app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("======================================");
    console.log("   WATCH & EARN SERVER");
    console.log("======================================");
    console.log(
        `Server running at http://localhost:${PORT}`
    );
    console.log("======================================");
    console.log("");
});