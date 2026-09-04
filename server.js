  require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
// =========================================================
// SAFE STRING CLEANER
// =========================================================
function cleanString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value)
        .trim()
        .replace(/[<>]/g, "");
}
const ADMIN_EMAIL = "admin@watchandearn.com";
const ADMIN_PASSWORD = "Admin@12345";

const DAILY_VIDEO_LIMIT = 10;
const VIDEO_DURATION_MINUTES = 15;
const ACTIVATION_FEE = 1500;
const ACTIVATION_FEE_PKR = ACTIVATION_FEE;
/* =========================================================
   UPLOADS
========================================================= */

const uploadDir = path.join(__dirname, "public", "uploads");

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },

    filename(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();

        cb(
            null,
            `upload-${Date.now()}-${Math.floor(Math.random() * 1000000)}${ext}`
        );
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter(req, file, cb) {
        if (file.mimetype && file.mimetype.startsWith("image/")) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed."));
        }
    }
});

/* =========================================================
   MIDDLEWARE
========================================================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({
    extended: true,
    limit: "1mb"
}));

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "watch-and-earn-session-secret-change-me",

        resave: false,
        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 24 * 60 * 60 * 1000
        }
    })
);

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* =========================================================
   HELPERS
========================================================= */

function safeString(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function safeNumber(value, fallback = 0) {
    const n = Number(value);

    return Number.isFinite(n)
        ? n
        : fallback;
}

function todayString() {
    return new Date()
        .toISOString()
        .slice(0, 10);
}

function requireUser(req, res, next) {
    if (
        !req.session ||
        !req.session.user ||
        !req.session.user.id
    ) {
        return res.status(401).json({
            success: false,
            message: "Please login first."
        });
    }

    next();
}

function requireAdmin(req, res, next) {
    if (
        !req.session ||
        req.session.isAdmin !== true
    ) {
        return res.status(401).json({
            success: false,
            message: "Admin login required."
        });
    }

    next();
}

/* =========================================================
   PAGE ROUTES
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "index.html")
    );
});

app.get("/admin", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );
});

app.get("/login", (req, res) => {
    const file = path.join(__dirname, "public", "login.html");

    if (fs.existsSync(file)) {
        return res.sendFile(file);
    }

    res.redirect("/");
});

app.get("/register", (req, res) => {
    const file = path.join(__dirname, "public", "register.html");

    if (fs.existsSync(file)) {
        return res.sendFile(file);
    }

    res.redirect("/");
});

/* =========================================================
   STATUS
========================================================= */

app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Watch & Earn server is running.",
        daily_video_limit: DAILY_VIDEO_LIMIT,
        video_duration_minutes: VIDEO_DURATION_MINUTES,
        activation_fee: ACTIVATION_FEE
    });
});

/* =========================================================
   CONFIG
========================================================= */

app.get("/api/config", (req, res) => {
    res.json({
        success: true,

        config: {
            activation_fee: ACTIVATION_FEE,
            daily_video_limit: DAILY_VIDEO_LIMIT,
            video_duration_minutes: VIDEO_DURATION_MINUTES
        },

        activation_fee: ACTIVATION_FEE,
        daily_video_limit: DAILY_VIDEO_LIMIT,
        video_duration_minutes: VIDEO_DURATION_MINUTES
    });
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/register", async (req, res) => {
    try {
        const fullName = safeString(req.body.full_name);
        const username = safeString(req.body.username);
        const email = safeString(req.body.email).toLowerCase();
        const mobile = safeString(req.body.mobile);
        const password = safeString(req.body.password);
        const referral = safeString(req.body.referral);

        if (
            !fullName ||
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
                message: "Password must be at least 8 characters."
            });
        }

        const existing = await db.query(
            `
            SELECT id
            FROM users
            WHERE username = $1
               OR email = $2
            LIMIT 1
            `,
            [username, email]
        );

        if (existing.rows.length) {
            return res.status(400).json({
                success: false,
                message: "Username or email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(
            password,
            10
        );

        const result = await db.query(
            `
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
            VALUES
            ($1,$2,$3,$4,$5,0,'inactive')
            RETURNING id, full_name, username, email
            `,
            [
                fullName,
                username,
                email,
                mobile,
                passwordHash
            ]
        );

        const user = result.rows[0];

        /*
         * Referral relationship is recorded.
         * No automatic monetary reward is issued here.
         */

        if (referral) {
            const referrer = await db.query(
                `
                SELECT id
                FROM users
                WHERE username = $1
                LIMIT 1
                `,
                [referral]
            );

            if (
                referrer.rows.length &&
                Number(referrer.rows[0].id) !== Number(user.id)
            ) {
                try {
                    await db.query(
                        `
                        INSERT INTO referrals
                        (
                            referrer_id,
                            referred_user_id,
                            signup_bonus,
                            earning_percentage
                        )
                        VALUES
                        ($1,$2,0,0)
                        `,
                        [
                            referrer.rows[0].id,
                            user.id
                        ]
                    );
                } catch (err) {
                    console.error(
                        "REFERRAL RECORD ERROR:",
                        err.message
                    );
                }
            }
        }

        res.status(201).json({
            success: true,
            message: "Account created successfully.",
            user_id: user.id
        });

    } catch (error) {
        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to create account."
        });
    }
});

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/login", async (req, res) => {
    try {
        const email =
            safeString(req.body.email).toLowerCase();

        const password =
            safeString(req.body.password);

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        const result = await db.query(
            `
            SELECT *
            FROM users
            WHERE email = $1
            LIMIT 1
            `,
            [email]
        );

        if (!result.rows.length) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        const valid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!valid) {
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
                    safeNumber(user.wallet_balance),
                activation_status:
                    user.activation_status
            }
        });

    } catch (error) {
        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to login."
        });
    }
});

/* =========================================================
   LOGOUT
========================================================= */

app.post("/api/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to logout."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            success: true,
            message: "Logged out successfully."
        });
    });
});

/* =========================================================
   ME
========================================================= */

app.get("/api/me", requireUser, async (req, res) => {
    try {
        const result = await db.query(
            `
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
            WHERE id = $1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = result.rows[0];

        res.json({
            success: true,
            user: {
                ...user,
                wallet_balance:
                    safeNumber(user.wallet_balance)
            }
        });

    } catch (error) {
        console.error(
            "ME ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load account."
        });
    }
});

/* =========================================================
   WALLET
========================================================= */

app.get("/api/wallet", requireUser, async (req, res) => {
    try {
        const result = await db.query(
            `
            SELECT
                wallet_balance,
                activation_status
            FROM users
            WHERE id = $1
            LIMIT 1
            `,
            [req.session.user.id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const row = result.rows[0];

        res.json({
            success: true,

            wallet: {
                wallet_balance:
                    safeNumber(row.wallet_balance),

                activation_status:
                    row.activation_status
            }
        });

    } catch (error) {
        console.error(
            "WALLET ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load wallet."
        });
    }
});
/* =========================================================
   USER HISTORY - READ ONLY
   Deposits + Withdrawals + Earnings
========================================================= */

app.get("/api/history", requireUser, async (req, res) => {

    try {

        const userId = req.session.user.id;

        /* =========================
           DEPOSITS
        ========================= */

        const depositsResult = await db.query(
            `
            SELECT
                id,
                amount,
                payment_method,
                transaction_reference,
                status,
                created_at
            FROM deposits
            WHERE user_id = $1
            ORDER BY id DESC
            `,
            [userId]
        );


        /* =========================
           WITHDRAWALS
        ========================= */

        const withdrawalsResult = await db.query(
            `
            SELECT
                id,
                amount,
                method,
                account_number,
                status,
                created_at
            FROM withdrawals
            WHERE user_id = $1
            ORDER BY id DESC
            `,
            [userId]
        );


        /* =========================
           EARNINGS / TRANSACTIONS
        ========================= */

        const transactionsResult = await db.query(
            `
            SELECT
                id,
                type,
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = $1
            ORDER BY id DESC
            `,
            [userId]
        );


        const history = [];


        /* =========================
           ADD DEPOSITS
        ========================= */

        depositsResult.rows.forEach(row => {

            history.push({

                id: `deposit-${row.id}`,

                type: "deposit",

                amount: safeNumber(row.amount),

                description:
                    `Deposit • ${row.payment_method}`,

                status:
                    String(row.status || "pending")
                    .toLowerCase(),

                reference:
                    row.transaction_reference || "",

                created_at:
                    row.created_at

            });

        });


        /* =========================
           ADD WITHDRAWALS
        ========================= */

        withdrawalsResult.rows.forEach(row => {

            history.push({

                id: `withdrawal-${row.id}`,

                type: "withdrawal",

                amount: safeNumber(row.amount),

                description:
                    `Withdrawal • ${row.method}`,

                status:
                    String(row.status || "pending")
                    .toLowerCase(),

                account:
                    row.account_number || "",

                created_at:
                    row.created_at

            });

        });


        /* =========================
           ADD EARNINGS
        ========================= */

        transactionsResult.rows.forEach(row => {

            history.push({

                id: `transaction-${row.id}`,

                type:
                    String(row.type || "")
                    .toLowerCase(),

                amount:
                    safeNumber(row.amount),

                description:
                    row.description || "",

                status:
                    "successful",

                created_at:
                    row.created_at

            });

        });


        /* =========================
           SORT ALL HISTORY
        ========================= */

        history.sort((a, b) => {

            const dateA =
                new Date(a.created_at || 0).getTime();

            const dateB =
                new Date(b.created_at || 0).getTime();

            return dateB - dateA;

        });


        res.json({

            success: true,

            transactions: history

        });


    } catch (error) {

        console.error(
            "HISTORY ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message:
                "Unable to load history."

        });

    }

});
/* =========================================================
   DASHBOARD
========================================================= */

app.get("/api/dashboard", requireUser, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const today = todayString();

        /* =========================
           USER
        ========================= */

        const userResult = await db.query(
            `
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
            WHERE id = $1
            LIMIT 1
            `,
            [userId]
        );

        if (!userResult.rows.length) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const user = userResult.rows[0];

        /* =========================
           TODAY'S VIDEOS
        ========================= */

        const watchResult = await db.query(
            `
            SELECT COUNT(*) AS count
            FROM video_watches
            WHERE user_id = $1
              AND started_at::date = CURRENT_DATE
            `,
            [userId]
        );

        const todayVideos =
            Number(
                watchResult.rows[0]?.count || 0
            );

        /* =========================
           TODAY'S EARNING
        ========================= */

        const todayEarningResult = await db.query(
            `
            SELECT
                COALESCE(SUM(amount), 0) AS today_earning
            FROM transactions
            WHERE user_id = $1
              AND type = 'earning'
              AND created_at::date = CURRENT_DATE
            `,
            [userId]
        );

        const todayEarning =
            safeNumber(
                todayEarningResult.rows[0]?.today_earning
            );

        /* =========================
           TOTAL EARNINGS
        ========================= */

        const totalEarningResult = await db.query(
            `
            SELECT
                COALESCE(SUM(amount), 0) AS total_earnings
            FROM transactions
            WHERE user_id = $1
              AND type = 'earning'
            `,
            [userId]
        );

        const totalEarnings =
            safeNumber(
                totalEarningResult.rows[0]?.total_earnings
            );

        /* =========================
           PENDING SETTLEMENTS
        ========================= */

        const pendingResult = await db.query(
            `
            SELECT
                COALESCE(SUM(amount), 0) AS pending_earnings
            FROM wallet_settlements
            WHERE user_id = $1
              AND status = 'pending'
            `,
            [userId]
        );

        const pendingEarnings =
            safeNumber(
                pendingResult.rows[0]?.pending_earnings
            );
/* =========================
           TOTAL APPROVED DEPOSIT
        ========================= */

        const totalDepositResult =
            await db.query(
                `
                SELECT
                    COALESCE(
                        SUM(amount),
                        0
                    ) AS total_deposit
                FROM deposits
                WHERE user_id = $1
                  AND LOWER(
                      COALESCE(status, '')
                  ) = 'approved'
                `,
                [userId]
            );

        const totalDeposit =
            safeNumber(
                totalDepositResult.rows[0]
                    ?.total_deposit
            );
        /* =========================
           RECENT TRANSACTIONS
        ========================= */

        const transactions = await db.query(
            `
            SELECT
                id,
                type,
                amount,
                description,
                created_at
            FROM transactions
            WHERE user_id = $1
            ORDER BY id DESC
            LIMIT 10
            `,
            [userId]
        );

        /* =========================
           TODAY'S TASKS
        ========================= */

        const tasks = await db.query(
            `
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
            WHERE is_active = 1
              AND task_date = $1
            ORDER BY id DESC
            `,
            [today]
        );

        /* =========================
           RESPONSE
        ========================= */

        res.json({
            success: true,

            user: {
                ...user,

                wallet_balance:
                    safeNumber(
                        user.wallet_balance
                    )
            },

            wallet: {
    wallet_balance:
        safeNumber(
            user.wallet_balance
        ),

    activation_status:
        user.activation_status,

    total_deposit:
        totalDeposit,

    total_earnings:
        totalEarnings,

    pending_earnings:
        pendingEarnings
},

            today: {
                videos:
                    todayVideos,

                remaining_videos:
                    Math.max(
                        DAILY_VIDEO_LIMIT -
                        todayVideos,
                        0
                    ),

                earning:
                    todayEarning
            },

            earnings: {
                today:
                    todayEarning,

                total:
                    totalEarnings,

                pending:
                    pendingEarnings
            },

            limits: {
                daily_video_limit:
                    DAILY_VIDEO_LIMIT,

                video_duration_minutes:
                    VIDEO_DURATION_MINUTES
            },

            tasks:
                tasks.rows.map(task => ({
                    ...task,

                    reward:
                        safeNumber(
                            task.reward
                        ),

                    duration_minutes:
                        Number(
                            task.duration_minutes ||
                            VIDEO_DURATION_MINUTES
                        )
                })),

            recent_transactions:
                transactions.rows.map(row => ({
                    ...row,

                    amount:
                        safeNumber(
                            row.amount
                        )
                }))
        });

    } catch (error) {

        console.error(
            "DASHBOARD ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to load dashboard."
        });
    }
});

/* =========================================================
   TASKS
========================================================= */

app.get("/api/tasks", requireUser, async (req, res) => {
    try {
        const result = await db.query(
            `
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
            WHERE is_active = 1
              AND task_date = $1
            ORDER BY id DESC
            `,
            [todayString()]
        );

        res.json({
            success: true,

            tasks: result.rows.map(task => ({
                id: Number(task.id),
                title: task.title,
                youtube_url: task.youtube_url,
                reward: safeNumber(task.reward),
                duration_minutes:
                    Number(
                        task.duration_minutes ||
                        VIDEO_DURATION_MINUTES
                    ),
                task_date: task.task_date,
                is_active: Number(task.is_active),
                created_at: task.created_at
            }))
        });

    } catch (error) {
        console.error(
            "TASKS ERROR:",
            error
        );

        res.status(500).json({
            success: false,
            message: "Unable to load video tasks."
        });
    }
});

/* =========================================================
   START TASK
========================================================= */

app.post(
    "/api/tasks/:id/start",
    requireUser,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const userId = req.session.user.id;

            if (
                !Number.isInteger(taskId) ||
                taskId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid video task."
                });
            }

            const taskResult = await db.query(
                `
                SELECT
                    id,
                    title,
                    youtube_url,
                    reward,
                    duration_minutes,
                    task_date,
                    is_active
                FROM video_tasks
                WHERE id = $1
                  AND is_active = 1
                  AND task_date = $2
                LIMIT 1
                `,
                [taskId, todayString()]
            );

            if (!taskResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Video task not found or inactive."
                });
            }

            const task = taskResult.rows[0];

            /*
             * Check previous watch.
             * A task can only be started once.
             */
            const existing = await db.query(
                `
                SELECT
                    id,
                    status,
                    started_at,
                    completed_at
                FROM video_watches
                WHERE user_id = $1
                  AND video_id = $2
                ORDER BY id DESC
                LIMIT 1
                `,
                [userId, taskId]
            );

            if (existing.rows.length) {

                const watch = existing.rows[0];

                /*
                 * Already claimed:
                 * NEVER allow the video to open again.
                 */
                if (watch.status === "claimed") {

                    return res.json({
                        success: true,
                        status: "claimed",
                        already_claimed: true,
                        watch_id: watch.id,
                        remaining_seconds: 0,
                        youtube_url: task.youtube_url,
                        reward: safeNumber(task.reward),
                        message:
                            "Reward already claimed for this video."
                    });
                }

                /*
                 * Completed but not claimed yet.
                 * Do not start a new watch.
                 */
                if (watch.status === "completed") {

                    return res.json({
                        success: true,
                        status: "completed",
                        already_completed: true,
                        watch_id: watch.id,
                        remaining_seconds: 0,
                        youtube_url: task.youtube_url,
                        reward: safeNumber(task.reward),
                        message:
                            "Video already completed. Please claim your reward."
                    });
                }

                /*
                 * Existing active watch.
                 * Continue its timer.
                 */
                if (watch.status === "started") {

                    const duration =
                        Number(
                            task.duration_minutes ||
                            VIDEO_DURATION_MINUTES
                        );

                    const startedAt =
                        watch.started_at;

                    const elapsed =
                        startedAt
                            ? Math.floor(
                                (
                                    Date.now() -
                                    new Date(
                                        startedAt
                                    ).getTime()
                                ) / 1000
                            )
                            : 0;

                    const remaining =
                        Math.max(
                            (duration * 60) -
                            elapsed,
                            0
                        );

                    /*
                     * If required time has already passed,
                     * mark the watch completed.
                     */
                    if (remaining <= 0) {

                        await db.query(
                            `
                            UPDATE video_watches
                            SET
                                status = 'completed',
                                completed_at =
                                    COALESCE(
                                        completed_at,
                                        CURRENT_TIMESTAMP
                                    )
                            WHERE id = $1
                              AND user_id = $2
                              AND status = 'started'
                            `,
                            [
                                watch.id,
                                userId
                            ]
                        );

                        return res.json({
                            success: true,
                            status: "completed",
                            already_completed: true,
                            watch_id: watch.id,
                            remaining_seconds: 0,
                            youtube_url:
                                task.youtube_url,
                            reward:
                                safeNumber(
                                    task.reward
                                ),
                            message:
                                "Video completed. Please claim your reward."
                        });
                    }

                    return res.json({
                        success: true,
                        status: "started",
                        watch_id: watch.id,
                        remaining_seconds: remaining,
                        youtube_url:
                            task.youtube_url,
                        reward:
                            safeNumber(task.reward)
                    });
                }
            }

            /*
             * No previous watch.
             * Check today's video limit.
             */
            const dailyCount = await db.query(
                `
                SELECT COUNT(*) AS count
                FROM video_watches
                WHERE user_id = $1
                  AND started_at::date = CURRENT_DATE
                `,
                [userId]
            );

            const count =
                Number(
                    dailyCount.rows[0].count || 0
                );

            if (
                count >= DAILY_VIDEO_LIMIT
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "You have reached today's video limit."
                });
            }

            const duration =
                Number(
                    task.duration_minutes ||
                    VIDEO_DURATION_MINUTES
                );

            /*
             * Start a brand-new video watch.
             */
          const insert = await db.query(
    `
    INSERT INTO video_watches
    (
        user_id,
        video_id,
        started_at,
        reward,
        status
    )
    VALUES
    (
        $1,
        $2,
        CURRENT_TIMESTAMP,
        $3,
        'started'
    )
    RETURNING
        id,
        reward
    `,
    [
        userId,
        taskId,
        safeNumber(task.reward)
    ]
);

            res.json({
                success: true,
                status: "started",
                watch_id:
                    insert.rows[0].id,
                remaining_seconds:
                    duration * 60,
                youtube_url:
                    task.youtube_url,
                reward:
                    safeNumber(task.reward)
            });

        } catch (error) {

            console.error(
                "START TASK ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to start video task."
            });
        }
    }
);
/* =========================================================
   TASK STATUS
========================================================= */

app.get(
    "/api/tasks/:id/status",
    requireUser,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const userId = req.session.user.id;

            const taskResult = await db.query(
                `
                SELECT *
                FROM video_tasks
                WHERE id = $1
                LIMIT 1
                `,
                [taskId]
            );

            if (!taskResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Task not found."
                });
            }

            const task = taskResult.rows[0];

            const duration =
                Number(
                    task.duration_minutes ||
                    VIDEO_DURATION_MINUTES
                );

            const watchResult = await db.query(
                `
                SELECT *
                FROM video_watches
                WHERE user_id = $1
                  AND video_id = $2
                ORDER BY id DESC
                LIMIT 1
                `,
                [userId, taskId]
            );

            if (!watchResult.rows.length) {
                return res.json({
                    success: true,
                    status: "not_started",
                    remaining_seconds:
                        duration * 60,
                    youtube_url:
                        task.youtube_url
                });
            }

            const watch = watchResult.rows[0];

            if (watch.status !== "started") {
                return res.json({
                    success: true,
                    status: watch.status,
                    remaining_seconds: 0,
                    youtube_url:
                        task.youtube_url
                });
            }

            const elapsed =
                Math.floor(
                    (
                        Date.now() -
                        new Date(
                            watch.started_at
                        ).getTime()
                    ) / 1000
                );

            const remaining =
                Math.max(
                    duration * 60 -
                    elapsed,
                    0
                );

            if (remaining <= 0) {
                await db.query(
                    `
                    UPDATE video_watches
                    SET
                        status = 'completed',
                        completed_at =
                            CURRENT_TIMESTAMP
                    WHERE id = $1
                      AND status = 'started'
                    `,
                    [watch.id]
                );

                return res.json({
                    success: true,
                    status: "completed",
                    remaining_seconds: 0,
                    youtube_url:
                        task.youtube_url
                });
            }

            res.json({
                success: true,
                status: "started",
                remaining_seconds: remaining,
                youtube_url:
                    task.youtube_url
            });

        } catch (error) {
            console.error(
                "TASK STATUS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to check video status."
            });
        }
    }
);

/* =========================================================
   COMPLETE TASK
========================================================= */

app.post(
    "/api/tasks/:id/complete",
    requireUser,
    async (req, res) => {
        try {
            const taskId = Number(req.params.id);
            const userId = req.session.user.id;

            const result = await db.query(
                `
                SELECT *
                FROM video_watches
                WHERE user_id = $1
                  AND video_id = $2
                ORDER BY id DESC
                LIMIT 1
                `,
                [userId, taskId]
            );

            if (!result.rows.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please start the video first."
                });
            }

            const watch = result.rows[0];

            if (watch.status === "completed") {
                return res.json({
                    success: true,
                    status: "completed",
                    message:
                        "Video already completed."
                });
            }

            if (watch.status !== "started") {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid video status."
                });
            }

            const taskResult = await db.query(
                `
                SELECT duration_minutes
                FROM video_tasks
                WHERE id = $1
                LIMIT 1
                `,
                [taskId]
            );

            if (!taskResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Task not found."
                });
            }

            const duration =
                Number(
                    taskResult.rows[0].duration_minutes ||
                    VIDEO_DURATION_MINUTES
                );

            const elapsed =
                Math.floor(
                    (
                        Date.now() -
                        new Date(
                            watch.started_at
                        ).getTime()
                    ) / 1000
                );

            if (elapsed < duration * 60) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Please complete the required watch time first.",
                    remaining_seconds:
                        duration * 60 -
                        elapsed
                });
            }

            await db.query(
                `
                UPDATE video_watches
                SET
                    status = 'completed',
                    completed_at =
                        CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [watch.id]
            );

            res.json({
                success: true,
                status: "completed",
                message:
                    "Video completed successfully."
            });

        } catch (error) {
            console.error(
                "COMPLETE TASK ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to complete video task."
            });
        }
    }
);
    /* =========================================================
   CLAIM TASK - ONE TIME CLAIM + WALLET CREDIT
========================================================= */

app.post(
    "/api/tasks/:id/claim",
    requireUser,
    async (req, res) => {

        try {

            const taskId = Number(req.params.id);
            const userId = req.session.user.id;

            if (
                !Number.isInteger(taskId) ||
                taskId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid task ID."
                });
            }

            /* =========================
               GET WATCH
            ========================= */

            const watchResult =
                await db.query(
                    `
                    SELECT
                        vw.id,
                        vw.status,
                        vw.started_at,
                        vw.completed_at,
                        vw.reward,
                        vt.title,
                        vt.duration_minutes
                    FROM video_watches vw
                    JOIN video_tasks vt
                        ON vt.id = vw.video_id
                    WHERE vw.user_id = $1
                      AND vw.video_id = $2
                    ORDER BY vw.id DESC
                    LIMIT 1
                    `,
                    [userId, taskId]
                );

            if (!watchResult.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please start the video first."
                });
            }

            const watch =
                watchResult.rows[0];


            /* =========================
               ALREADY CLAIMED
            ========================= */

            if (watch.status === "claimed") {

                const walletResult =
                    await db.query(
                        `
                        SELECT wallet_balance
                        FROM users
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [userId]
                    );

                const walletBalance =
                    walletResult.rows.length
                        ? safeNumber(
                            walletResult.rows[0]
                                .wallet_balance
                        )
                        : 0;

                return res.json({
                    success: true,
                    status: "claimed",
                    already_claimed: true,
                    reward:
                        safeNumber(
                            watch.reward
                        ),
                    wallet_balance:
                        walletBalance,
                    message:
                        "Reward already claimed for this video."
                });
            }


            /* =========================
               CHECK WATCH TIME
            ========================= */

            if (watch.status === "started") {

                if (!watch.started_at) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Video start time not found."
                    });
                }

                const duration =
                    Number(
                        watch.duration_minutes ||
                        VIDEO_DURATION_MINUTES
                    );

                const elapsed =
                    Math.floor(
                        (
                            Date.now() -
                            new Date(
                                watch.started_at
                            ).getTime()
                        ) / 1000
                    );

                const requiredSeconds =
                    duration * 60;

                if (
                    elapsed < requiredSeconds
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Please complete the required watch time first.",
                        remaining_seconds:
                            requiredSeconds -
                            elapsed
                    });
                }

                const completed =
                    await db.query(
                        `
                        UPDATE video_watches
                        SET
                            status = 'completed',
                            completed_at =
                                COALESCE(
                                    completed_at,
                                    CURRENT_TIMESTAMP
                                )
                        WHERE id = $1
                          AND user_id = $2
                          AND status = 'started'
                        RETURNING
                            id,
                            reward,
                            status,
                            completed_at
                        `,
                        [
                            watch.id,
                            userId
                        ]
                    );

                if (!completed.rows.length) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Video completion could not be confirmed."
                    });
                }

                watch.status =
                    completed.rows[0].status;

                watch.reward =
                    completed.rows[0].reward;

                watch.completed_at =
                    completed.rows[0].completed_at;
            }


            /* =========================
               MUST BE COMPLETED
            ========================= */

            if (
                watch.status !== "completed"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This video cannot be claimed yet."
                });
            }


            /* =========================
               REWARD
            ========================= */

            const reward =
                safeNumber(
                    watch.reward
                );

            if (reward <= 0) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This video has no valid reward."
                });
            }


            /* =========================
               DUPLICATE CHECK
            ========================= */

            const description =
                `Video earning #${taskId} - ${watch.title}`;

            const existing =
                await db.query(
                    `
                    SELECT id
                    FROM transactions
                    WHERE user_id = $1
                      AND type = 'earning'
                      AND description = $2
                    LIMIT 1
                    `,
                    [
                        userId,
                        description
                    ]
                );

            if (existing.rows.length) {

                const walletResult =
                    await db.query(
                        `
                        SELECT wallet_balance
                        FROM users
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [userId]
                    );

                const walletBalance =
                    walletResult.rows.length
                        ? safeNumber(
                            walletResult.rows[0]
                                .wallet_balance
                        )
                        : 0;

                return res.json({
                    success: true,
                    status: "claimed",
                    already_claimed: true,
                    reward: reward,
                    wallet_balance:
                        walletBalance,
                    message:
                        "Reward already recorded for this video."
                });
            }


            /* =========================
               FINAL CLAIM
            ========================= */

            const claim =
                await db.query(
                    `
                    UPDATE video_watches
                    SET
                        status = 'claimed',
                        completed_at =
                            COALESCE(
                                completed_at,
                                CURRENT_TIMESTAMP
                            )
                    WHERE id = $1
                      AND user_id = $2
                      AND status = 'completed'
                    RETURNING
                        id,
                        reward,
                        status
                    `,
                    [
                        watch.id,
                        userId
                    ]
                );

            if (!claim.rows.length) {

                const walletResult =
                    await db.query(
                        `
                        SELECT wallet_balance
                        FROM users
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [userId]
                    );

                const walletBalance =
                    walletResult.rows.length
                        ? safeNumber(
                            walletResult.rows[0]
                                .wallet_balance
                        )
                        : 0;

                return res.json({
                    success: true,
                    status: "claimed",
                    already_claimed: true,
                    reward: reward,
                    wallet_balance:
                        walletBalance,
                    message:
                        "Reward already claimed for this video."
                });
            }


            const claimedReward =
                safeNumber(
                    claim.rows[0].reward
                );


            /* =========================
               RECORD EARNING
            ========================= */

            const transaction =
                await db.query(
                    `
                    INSERT INTO transactions
                    (
                        user_id,
                        type,
                        amount,
                        description
                    )
                    VALUES
                    (
                        $1,
                        'earning',
                        $2,
                        $3
                    )
                    RETURNING
                        id,
                        amount,
                        created_at
                    `,
                    [
                        userId,
                        claimedReward,
                        description
                    ]
                );


            /* =========================
               ⭐ ADD REWARD TO WALLET
            ========================= */

            const walletUpdate =
                await db.query(
                    `
                    UPDATE users
                    SET
                        wallet_balance =
                            COALESCE(
                                wallet_balance,
                                0
                            ) + $1
                    WHERE id = $2
                    RETURNING
                        wallet_balance
                    `,
                    [
                        claimedReward,
                        userId
                    ]
                );


            if (!walletUpdate.rows.length) {

                console.error(
                    "WALLET CREDIT ERROR: User not found."
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Reward claimed but wallet update failed."
                });
            }


            const walletBalance =
                safeNumber(
                    walletUpdate.rows[0]
                        .wallet_balance
                );


            /* =========================
               WALLET SETTLEMENT
            ========================= */

            try {

                await db.query(
                    `
                    INSERT INTO wallet_settlements
                    (
                        user_id,
                        transaction_id,
                        amount,
                        status
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        'completed'
                    )
                    `,
                    [
                        userId,
                        transaction.rows[0].id,
                        claimedReward
                    ]
                );

            } catch (settlementError) {

                console.error(
                    "WALLET SETTLEMENT ERROR:",
                    settlementError.message
                );

            }


            /* =========================
               TODAY'S EARNING
            ========================= */

            const today =
                await db.query(
                    `
                    SELECT
                        COALESCE(
                            SUM(amount),
                            0
                        ) AS today_earning
                    FROM transactions
                    WHERE user_id = $1
                      AND type = 'earning'
                      AND created_at::date =
                          CURRENT_DATE
                    `,
                    [userId]
                );

            const todayEarning =
                safeNumber(
                    today.rows[0]
                        ?.today_earning
                );


            /* =========================
               SUCCESS
            ========================= */

            return res.json({

                success: true,

                status: "claimed",

                already_claimed: false,

                reward:
                    claimedReward,

                transaction_id:
                    transaction.rows[0].id,

                today_earning:
                    todayEarning,

                wallet_balance:
                    walletBalance,

                message:
                    `Rs. ${claimedReward.toFixed(2)} reward added to your wallet successfully.`
            });


        } catch (error) {

            console.error(
                "CLAIM TASK ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to process task claim."
            });
        }
    }
);
/* =========================================================
   ACTIVATION STATUS
========================================================= */

app.get(
    "/api/activation",
    requireUser,
    async (req, res) => {
        try {
            const userId = req.session.user.id;

            const userResult = await db.query(
                `
                SELECT activation_status
                FROM users
                WHERE id = $1
                LIMIT 1
                `,
                [userId]
            );

            if (!userResult.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            const paymentResult = await db.query(
                `
                SELECT
                    id,
                    amount,
                    payment_method,
                    transaction_reference,
                    screenshot_path,
                    status,
                    submitted_at
                FROM activation_payments
                WHERE user_id = $1
                ORDER BY id DESC
                LIMIT 1
                `,
                [userId]
            );

            res.json({
                success: true,

                activation_status:
                    userResult.rows[0]
                        .activation_status,

                activated:
                    userResult.rows[0]
                        .activation_status === "active",

                activation_fee:
                    ACTIVATION_FEE,

                payment:
                    paymentResult.rows[0] || null
            });

        } catch (error) {
            console.error(
                "ACTIVATION ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load activation status."
            });
        }
    }
);

/* =========================================================
   ACTIVATION PAYMENT
========================================================= */

app.post(
    "/api/activation",
    requireUser,
    upload.single("screenshot"),
    async (req, res) => {
        try {
            const userId = req.session.user.id;

            const amount =
                safeNumber(req.body.amount);

            const method =
                safeString(
                    req.body.payment_method ||
                    req.body.method
                );

            const reference =
                safeString(
                    req.body.transaction_reference ||
                    req.body.reference
                );

            if (amount !== ACTIVATION_FEE) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Activation fee must be Rs. ${ACTIVATION_FEE}.`
                });
            }

            if (!method) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment method is required."
                });
            }

            if (!reference) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Transaction reference is required."
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Payment screenshot is required."
                });
            }

            const existing = await db.query(
                `
                SELECT id
                FROM activation_payments
                WHERE user_id = $1
                  AND status = 'pending'
                LIMIT 1
                `,
                [userId]
            );

            if (existing.rows.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Your previous activation request is already pending."
                });
            }

            const screenshotPath =
                `/uploads/${req.file.filename}`;

            const result = await db.query(
                `
                INSERT INTO activation_payments
                (
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    screenshot_path,
                    status
                )
                VALUES
                ($1,$2,$3,$4,$5,'pending')
                RETURNING id
                `,
                [
                    userId,
                    amount,
                    method,
                    reference,
                    screenshotPath
                ]
            );

            res.status(201).json({
                success: true,
                message:
                    "Activation request submitted for admin review.",
                request_id:
                    result.rows[0].id,
                status: "pending"
            });

        } catch (error) {
            console.error(
                "ACTIVATION SUBMIT ERROR:",
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
   REFERRALS
========================================================= */

/* =========================================================
   REFERRALS
========================================================= */

app.get(
    "/api/referrals",
    requireUser,
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;


            /* ================= USER ================= */

            const userResult =
                await db.query(
                    `
                    SELECT username
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );


            if (!userResult.rows.length) {

                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });

            }


            const username =
                userResult.rows[0].username;


            /* ================= REFERRALS ================= */

            const result =
                await db.query(
                    `
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

                    WHERE r.referrer_id = $1

                    ORDER BY r.id DESC
                    `,
                    [userId]
                );


            /* ================= REFERRAL HISTORY ================= */

            const historyResult =
                await db.query(
                    `
                    SELECT
                        amount,
                        description,
                        created_at
                    FROM transactions

                    WHERE user_id = $1
                      AND (
                          LOWER(type) LIKE '%referral%'
                          OR LOWER(description) LIKE '%referral%'
                      )

                    ORDER BY id DESC
                    `,
                    [userId]
                );


            const totalEarnings =
                historyResult.rows.reduce(
                    (total, row) => {

                        return total +
                            safeNumber(row.amount);

                    },
                    0
                );


            /* ================= REFERRAL LINK ================= */

            const referralLink =
                `${req.protocol}://${req.get("host")}/register.html?ref=${encodeURIComponent(username)}`;


            /* ================= RESPONSE ================= */

            res.json({

                success: true,

                referral_code:
                    username,

                referral_link:
                    referralLink,

                total_referrals:
                    result.rows.length,

                total_earnings:
                    totalEarnings,

                history:
                    historyResult.rows.map(row => ({

                        amount:
                            safeNumber(
                                row.amount
                            ),

                        description:
                            row.description ||
                            "Referral Earning",

                        created_at:
                            row.created_at

                    })),

                referrals:
                    result.rows.map(row => ({

                        id:
                            Number(row.id),

                        username:
                            row.username,

                        full_name:
                            row.full_name,

                        signup_bonus:
                            safeNumber(
                                row.signup_bonus
                            ),

                        earning_percentage:
                            safeNumber(
                                row.earning_percentage
                            ),

                        created_at:
                            row.created_at

                    }))

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

    }
);

/* =========================================================
   ADMIN LOGIN
========================================================= */

app.post("/api/admin/login", (req, res) => {
    const email =
        safeString(req.body.email).toLowerCase();

    const password =
        safeString(req.body.password);

    if (
        email !== ADMIN_EMAIL.toLowerCase() ||
        password !== ADMIN_PASSWORD
    ) {
        return res.status(401).json({
            success: false,
            message: "Invalid admin credentials."
        });
    }

    req.session.isAdmin = true;

    res.json({
        success: true,
        message: "Admin login successful."
    });
});

/* =========================================================
   ADMIN LOGOUT
========================================================= */
app.get("/admin-login", (req, res) => {
    res.sendFile(path.join(__dirname, "admin-login.html"));
});
app.post(
    "/api/admin/logout",
    requireAdmin,
    (req, res) => {
        req.session.admin = false;

        res.json({
            success: true,
            message: "Admin logged out."
        });
    }
);

/* =========================================================
   ADMIN ME
========================================================= */

app.get(
    "/api/admin/me",
    requireAdmin,
    (req, res) => {
        res.json({
            success: true,
            admin: true,
            email: ADMIN_EMAIL
        });
    }
);

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    async (req, res) => {
        try {
            const users = await db.query(
                `
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (
                        WHERE activation_status = 'active'
                    ) AS active,
                    COUNT(*) FILTER (
                        WHERE activation_status <> 'active'
                    ) AS inactive
                FROM users
                `
            );

            const activations = await db.query(
                `
                SELECT
                    COUNT(*) FILTER (
                        WHERE status = 'pending'
                    ) AS pending,
                    COUNT(*) FILTER (
                        WHERE status = 'approved'
                    ) AS approved,
                    COUNT(*) FILTER (
                        WHERE status = 'rejected'
                    ) AS rejected
                FROM activation_payments
                `
            );

            const deposits = await db.query(
                `
                SELECT
                    COUNT(*) FILTER (
                        WHERE status = 'pending'
                    ) AS pending,
                    COUNT(*) FILTER (
                        WHERE status = 'approved'
                    ) AS approved,
                    COUNT(*) FILTER (
                        WHERE status = 'rejected'
                    ) AS rejected
                FROM deposits
                `
            );

            const withdrawals = await db.query(
                `
                SELECT
                    COUNT(*) FILTER (
                        WHERE status = 'pending'
                    ) AS pending,
                    COUNT(*) FILTER (
                        WHERE status = 'approved'
                    ) AS approved,
                    COUNT(*) FILTER (
                        WHERE status = 'rejected'
                    ) AS rejected
                FROM withdrawals
                `
            );

            const videos = await db.query(
                `
                SELECT COUNT(*) AS count
                FROM video_tasks
                WHERE is_active = 1
                `
            );

            const wallet = await db.query(
                `
                SELECT
                    COALESCE(
                        SUM(wallet_balance),
                        0
                    ) AS total
                FROM users
                `
            );

            res.json({
                success: true,

                stats: {
                    users: {
                        total:
                            Number(
                                users.rows[0].total || 0
                            ),
                        active:
                            Number(
                                users.rows[0].active || 0
                            ),
                        inactive:
                            Number(
                                users.rows[0].inactive || 0
                            )
                    },

                    activations: {
                        pending:
                            Number(
                                activations.rows[0].pending || 0
                            ),
                        approved:
                            Number(
                                activations.rows[0].approved || 0
                            ),
                        rejected:
                            Number(
                                activations.rows[0].rejected || 0
                            )
                    },

                   deposits: {
    pending:
        Number(
            deposits.rows[0].pending || 0
        ),
    approved:
        Number(
            deposits.rows[0].approved || 0
        ),
    rejected:
        Number(
            deposits.rows[0].rejected || 0
        )
},

                    withdrawals: {
                        pending:
                            Number(
                                withdrawals.rows[0].pending || 0
                            ),
                        approved:
                            Number(
                                withdrawals.rows[0].approved || 0
                            ),
                        rejected:
                            Number(
                                withdrawals.rows[0].rejected || 0
                            )
                    },

                    active_videos:
                        Number(
                            videos.rows[0].count || 0
                        ),

                    total_wallet:
                        safeNumber(
                            wallet.rows[0].total
                        )
                }
            });

        } catch (error) {
            console.error(
                "ADMIN DASHBOARD ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load admin dashboard."
            });
        }
    }
);

/* =========================================================
   ADMIN USERS
========================================================= */

app.get(
    "/api/admin/users",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
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
                `
            );

            res.json({
                success: true,

                users:
                    result.rows.map(row => ({
                        ...row,
                        wallet_balance:
                            safeNumber(
                                row.wallet_balance
                            )
                    }))
            });

        } catch (error) {
            console.error(
                "ADMIN USERS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load users."
            });
        }
    }
);

/* =========================================================
   ADMIN VIDEOS LIST
========================================================= */

app.get("/api/admin/videos", requireAdmin, async (req, res) => {
    try {
        const result = await db.query(`
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
        `);

        res.json({
            success: true,
            videos: result.rows
        });

    } catch (error) {
        console.error("ADMIN VIDEOS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Failed to load videos"
        });
    }
});

/* =========================================================
   ADMIN VIDEOS ALIAS
========================================================= */

app.get(
    "/api/admin/tasks",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
                SELECT
                    id,
                    title,
                    youtube_url,
                    duration_minutes,
                    task_date,
                    is_active,
                    created_at
                FROM video_tasks
                ORDER BY id DESC
                `
            );

            res.json({
                success: true,
                tasks: result.rows,
                videos: result.rows
            });

        } catch (error) {
            console.error(
                "ADMIN TASKS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load admin tasks."
            });
        }
    }
);

/* =========================================================
   ADD ADMIN VIDEO
========================================================= */

app.post("/api/admin/videos", requireAdmin, async (req, res) => {
    try {
        const {
            title,
            youtube_url,
            reward,
            duration_minutes
        } = req.body;

        if (!title || !youtube_url || !duration_minutes) {
            return res.status(400).json({
                success: false,
                message: "Title, YouTube URL and duration are required"
            });
        }

        const rewardValue = Number(reward);
        const durationValue = Number(duration_minutes);

        if (!Number.isFinite(rewardValue) || rewardValue < 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid reward"
            });
        }

        if (!Number.isFinite(durationValue) || durationValue <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid duration"
            });
        }

        const taskDate = new Date().toISOString().slice(0, 10);

        const result = await db.query(`
            INSERT INTO video_tasks
            (
                title,
                youtube_url,
                reward,
                duration_minutes,
                task_date,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, 1)
            RETURNING
                id,
                title,
                youtube_url,
                reward,
                duration_minutes,
                task_date,
                is_active
        `, [
            title.trim(),
            youtube_url.trim(),
            rewardValue,
            durationValue,
            taskDate
        ]);

        res.json({
            success: true,
            message: "Video added successfully",
            video: result.rows[0]
        });

    } catch (error) {
        console.error("ADD VIDEO ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Failed to add video"
        });
    }
});
/* =========================================================
   ADMIN TASK ALIAS
========================================================= */

app.post(
    "/api/admin/tasks",
    requireAdmin,
    async (req, res) => {
        try {
            const title =
                safeString(req.body.title);

            const youtubeUrl =
                safeString(
                    req.body.youtube_url ||
                    req.body.youtubeUrl ||
                    req.body.url
                );

            const duration =
                Math.max(
                    1,
                    Number(
                        req.body.duration_minutes ||
                        VIDEO_DURATION_MINUTES
                    )
                );

            const taskDate =
                safeString(
                    req.body.task_date ||
                    todayString()
                );

            if (!title || !youtubeUrl) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Title and YouTube URL are required."
                });
            }

            const result = await db.query(
                `
                INSERT INTO video_tasks
                (
                    title,
                    youtube_url,
                    reward,
                    duration_minutes,
                    task_date,
                    is_active
                )
                VALUES
                ($1,$2,0,$3,$4,1)
                RETURNING *
                `,
                [
                    title,
                    youtubeUrl,
                    duration,
                    taskDate
                ]
            );

            res.status(201).json({
                success: true,
                message:
                    "Video added successfully.",
                task:
                    result.rows[0],
                video:
                    result.rows[0]
            });

        } catch (error) {
            console.error(
                "ADD TASK ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to add task."
            });
        }
    }
);

/* =========================================================
   DELETE ADMIN VIDEO
========================================================= */

app.delete(
    "/api/admin/videos/:id",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid video ID."
                });
            }

            await db.query(
                `
                DELETE FROM video_watches
                WHERE video_id = $1
                `,
                [id]
            );

            const result = await db.query(
                `
                DELETE FROM video_tasks
                WHERE id = $1
                RETURNING id
                `,
                [id]
            );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message: "Video not found."
                });
            }

            res.json({
                success: true,
                message:
                    "Video deleted successfully."
            });

        } catch (error) {
            console.error(
                "DELETE VIDEO ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to delete video."
            });
        }
    }
);

/* =========================================================
   ADMIN ACTIVATIONS
========================================================= */

app.get(
    "/api/admin/activation-payments",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
                SELECT
                    a.id,
                    a.user_id,
                    a.amount,
                    a.payment_method,
                    a.transaction_reference,
                    a.screenshot_path,
                    a.status,
                    a.submitted_at,
                    u.full_name,
                    u.username,
                    u.email,
                    u.mobile
                FROM activation_payments a
                JOIN users u
                    ON u.id = a.user_id
                ORDER BY a.id DESC
                `
            );

            res.json({
                success: true,
                activations: result.rows
            });

        } catch (error) {
            console.error(
                "ADMIN ACTIVATIONS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load activation payments."
            });
        }
    }
);

app.get(
    "/api/admin/activations",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
                SELECT
                    a.id,
                    a.user_id,
                    a.amount,
                    a.payment_method,
                    a.transaction_reference,
                    a.screenshot_path,
                    a.status,
                    a.submitted_at,
                    u.full_name,
                    u.username,
                    u.email,
                    u.mobile
                FROM activation_payments a
                JOIN users u
                    ON u.id = a.user_id
                ORDER BY a.id DESC
                `
            );

            res.json({
                success: true,
                activations: result.rows
            });

        } catch (error) {
            console.error(
                "ADMIN ACTIVATIONS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load activations."
            });
        }
    }
);

/* =========================================================
   APPROVE ACTIVATION
========================================================= */

app.post(
    "/api/admin/activation/:id/approve",
    requireAdmin,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            const result = await db.query(
                `
                SELECT
                    id,
                    user_id,
                    status
                FROM activation_payments
                WHERE id = $1
                `,
                [id]
            );

            if (!result.rows.length) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Activation payment not found."
                });
            }

            const payment = result.rows[0];

            if (payment.status !== "pending") {
                return res.status(400).json({
                    success: false,
                    message:
                        `Payment is already ${payment.status}.`
                });
            }

            await db.query(
                `
                UPDATE activation_payments
                SET status = 'approved'
                WHERE id = $1
                `,
                [id]
            );

            await db.query(
                `
                UPDATE users
                SET activation_status = 'active'
                WHERE id = $1
                `,
                [payment.user_id]
            );

            res.json({
                success: true,
                message:
                    "Activation approved successfully."
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
   REJECT ACTIVATION
========================================================= */

app.post(
    "/api/admin/activation/:id/reject",
    requireAdmin,
    async (req, res) => {

        try {

            const id =
                Number(req.params.id);

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid activation ID."
                });

            }

            /*
             * Reject only a PENDING request.
             *
             * After rejection:
             * activation payment = rejected
             * user account = inactive
             *
             * This allows the user to submit
             * a new activation request.
             */

            const result =
                await db.query(
                    `
                    WITH rejected AS (

                        UPDATE activation_payments
                        SET status = 'rejected'
                        WHERE id = $1
                          AND status = 'pending'
                        RETURNING
                            id,
                            user_id,
                            status

                    ),

                    updated_user AS (

                        UPDATE users u

                        SET activation_status = 'inactive'

                        FROM rejected r

                        WHERE u.id = r.user_id

                        RETURNING
                            u.id,
                            u.activation_status

                    )

                    SELECT
                        r.id,
                        r.user_id,
                        r.status,
                        u.activation_status

                    FROM rejected r

                    JOIN updated_user u
                        ON u.id = r.user_id
                    `,
                    [id]
                );


            /* =========================
               CHECK RESULT
            ========================= */

            if (!result.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Pending activation payment not found."
                });

            }


            const rejected =
                result.rows[0];


            /* =========================
               SUCCESS
            ========================= */

            res.json({

                success: true,

                message:
                    "Activation payment rejected. User can submit a new activation request.",

                activation: {

                    id:
                        rejected.id,

                    user_id:
                        rejected.user_id,

                    status:
                        "rejected",

                    activation_status:
                        rejected.activation_status

                }

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
   USER DEPOSITS
========================================================= */

app.post(
    "/api/deposits",
    requireUser,
    upload.single("payment_proof"),
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;

            const amount =
                safeNumber(req.body.amount);

            const paymentMethod =
                safeString(
                    req.body.payment_method ||
                    req.body.method
                );

            const reference =
                safeString(
                    req.body.reference ||
                    req.body.transaction_reference
                );

            /* =========================
               VALIDATION
            ========================= */

            if (!Number.isFinite(amount) || amount <= 0) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid deposit amount."
                });

            }

            if (!paymentMethod) {

                return res.status(400).json({
                    success: false,
                    message: "Please select a payment method."
                });

            }

            if (!reference) {

                return res.status(400).json({
                    success: false,
                    message: "Transaction reference is required."
                });

            }

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message: "Payment screenshot is required."
                });

            }

            /* =========================
               CHECK USER
            ========================= */

            const userResult =
                await db.query(
                    `
                    SELECT id
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );

            if (!userResult.rows.length) {

                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });

            }

            /* =========================
               CHECK SAME REFERENCE
            ========================= */

            const duplicate =
                await db.query(
                    `
                    SELECT id
                    FROM deposits
                    WHERE transaction_reference = $1
                    LIMIT 1
                    `,
                    [reference]
                );

            if (duplicate.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This transaction reference has already been submitted."
                });

            }

            /* =========================
               SAVE SCREENSHOT
            ========================= */

            const screenshotPath =
                `/uploads/${req.file.filename}`;

            /* =========================
               INSERT DEPOSIT
            ========================= */

            const result =
                await db.query(
                    `
                    INSERT INTO deposits
                    (
                        user_id,
                        amount,
                        payment_method,
                        transaction_reference,
                        screenshot_path,
                        status
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'pending'
                    )
                    RETURNING
                        id,
                        amount,
                        payment_method,
                        transaction_reference,
                        screenshot_path,
                        status,
                        created_at
                    `,
                    [
                        userId,
                        amount,
                        paymentMethod,
                        reference,
                        screenshotPath
                    ]
                );

            const deposit =
                result.rows[0];

            /* =========================
               SUCCESS
            ========================= */

            res.status(201).json({

                success: true,

                message:
                    "Deposit request submitted successfully.",

                deposit: {

                    id:
                        deposit.id,

                    amount:
                        safeNumber(
                            deposit.amount
                        ),

                    payment_method:
                        deposit.payment_method,

                    transaction_reference:
                        deposit.transaction_reference,

                    screenshot_path:
                        deposit.screenshot_path,

                    status:
                        deposit.status,

                    created_at:
                        deposit.created_at

                }

            });

        } catch (error) {

            console.error(
                "DEPOSIT SUBMIT ERROR:",
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
/* =========================================================
   USER WITHDRAWALS
========================================================= */

app.post(
    "/api/withdrawals",
    requireUser,
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;

            const amount =
                safeNumber(req.body.amount);

            const method =
                safeString(
                    req.body.method
                );

            const accountNumber =
                safeString(
                    req.body.account_number
                );

            /* =========================
               VALIDATION
            ========================= */

            if (!Number.isFinite(amount) || amount <= 0) {

                return res.status(400).json({
                    success: false,
                    message: "Please enter a valid withdrawal amount."
                });

            }

            if (!method) {

                return res.status(400).json({
                    success: false,
                    message: "Please select a withdrawal method."
                });

            }

            if (!accountNumber) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Account number or wallet address is required."
                });

            }

           /* =========================
   GET USER BALANCE
========================= */

const userResult = await db.query(
    `
    SELECT
        id,
        wallet_balance,
        activation_status
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
);

if (!userResult.rows.length) {

    return res.status(404).json({
        success: false,
        message: "User not found."
    });

}

const user =
    userResult.rows[0];

/* =========================
   ACTIVATION CHECK
========================= */

const activationStatus =
    String(
        user.activation_status || ""
    ).toLowerCase();

if (activationStatus !== "active") {

    return res.status(400).json({
        success: false,
        message:
            "Please activate your account first."
    });

}

/* =========================
   WALLET BALANCE
========================= */

const walletBalance =
    safeNumber(
        user.wallet_balance
    );

/* =========================
   BALANCE CHECK
========================= */

if (amount > walletBalance) {

    return res.status(400).json({
        success: false,
        message:
            "Insufficient wallet balance."
    });

}

            /* =========================
               CHECK PENDING WITHDRAWAL
            ========================= */

            const pending =
                await db.query(
                    `
                    SELECT id
                    FROM withdrawals
                    WHERE user_id = $1
                      AND status = 'pending'
                    LIMIT 1
                    `,
                    [userId]
                );

            if (pending.rows.length) {

                return res.status(400).json({
                    success: false,
                    message:
                        "You already have a pending withdrawal request."
                });

            }

           /* =========================
   CREATE WITHDRAWAL
   + DEDUCT WALLET IMMEDIATELY
========================= */

const result =
    await db.query(
        `
        WITH deducted AS (

            UPDATE users
            SET wallet_balance =
                COALESCE(wallet_balance, 0) - $2
            WHERE id = $1
              AND COALESCE(wallet_balance, 0) >= $2
              AND LOWER(COALESCE(activation_status, '')) = 'active'
            RETURNING
                id,
                wallet_balance

        ),

        created AS (

            INSERT INTO withdrawals
            (
                user_id,
                amount,
                method,
                account_number,
                status
            )
            SELECT
                $1,
                $2,
                $3,
                $4,
                'pending'
            FROM deducted
            RETURNING
                id,
                amount,
                method,
                account_number,
                status,
                created_at

        )

        SELECT
            c.id,
            c.amount,
            c.method,
            c.account_number,
            c.status,
            c.created_at,
            d.wallet_balance

        FROM created c
        JOIN deducted d
            ON d.id = $1
        `,
        [
            userId,
            amount,
            method,
            accountNumber
        ]
    );


/* =========================
   CHECK WITHDRAWAL CREATION
========================= */

if (!result.rows.length) {

    return res.status(400).json({
        success: false,
        message:
            "Unable to create withdrawal. Please check your wallet balance."
    });

}


const withdrawal =
    result.rows[0];


/* =========================
   SUCCESS
========================= */

res.status(201).json({

    success: true,

    message:
        "Withdrawal request submitted successfully.",

    withdrawal: {

        id:
            withdrawal.id,

        amount:
            safeNumber(
                withdrawal.amount
            ),

        method:
            withdrawal.method,

        account_number:
            withdrawal.account_number,

        status:
            withdrawal.status,

        created_at:
            withdrawal.created_at,

        wallet_balance:
            safeNumber(
                withdrawal.wallet_balance
            )

    }

});
} catch (error) {

            console.error(
                "WITHDRAWAL SUBMIT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to submit withdrawal request."
            });

        }

    }
);
/* =========================================================
   ADMIN DEPOSITS
========================================================= */

app.get(
    "/api/admin/deposits",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
                SELECT
                    d.id,
                    d.user_id,
                    d.amount,
                    d.payment_method,
                    d.transaction_reference,
                    d.screenshot_path,
                    d.status,
                    d.created_at,
                    u.full_name,
                    u.username,
                    u.email,
                    u.mobile
                FROM deposits d
                JOIN users u
                    ON u.id = d.user_id
                ORDER BY d.id DESC
                `
            );

            res.json({
                success: true,
                deposits: result.rows
            });

        } catch (error) {
            console.error(
                "ADMIN DEPOSITS ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Unable to load deposits."
            });
        }
    }
);
/* =========================
   ACTIVATION REQUEST
========================= */

app.post(
    "/api/activation/request",
    requireUser,
    upload.single("payment_proof"),
    async (req, res) => {

        try {

            const userId =
                req.session.user.id;

            const paymentMethod =
                cleanString(req.body.payment_method);

            const reference =
                cleanString(
                    req.body.reference ||
                    req.body.transaction_reference
                );


            /* =========================
               VALIDATION
            ========================= */

            if (!paymentMethod) {

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


            /* =========================
               CHECK USER
            ========================= */

            const userResult =
                await db.query(
                    `
                    SELECT
                        id,
                        activation_status
                    FROM users
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [userId]
                );


            if (!userResult.rows.length) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found."
                });

            }


            const activationStatus =
                String(
                    userResult.rows[0]
                        .activation_status || ""
                ).toLowerCase();


            /* =========================
               ALREADY ACTIVE
            ========================= */

            if (
                activationStatus === "active"
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Your account is already activated."
                });

            }


            /* =========================
               CHECK LAST ACTIVATION REQUEST
               
               IMPORTANT:
               pending  = BLOCK
               approved = BLOCK
               rejected = ALLOW
            ========================= */

            const previousRequest =
                await db.query(
                    `
                    SELECT
                        id,
                        status
                    FROM activation_payments
                    WHERE user_id = $1
                    ORDER BY id DESC
                    LIMIT 1
                    `,
                    [userId]
                );


            if (previousRequest.rows.length) {

                const previousStatus =
                    String(
                        previousRequest.rows[0]
                            .status || ""
                    ).toLowerCase();


                /* =========================
                   PENDING
                ========================= */

                if (
                    previousStatus === "pending"
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "You have already requested activation. Please wait for admin approval."
                    });

                }


                /* =========================
                   APPROVED
                ========================= */

                if (
                    previousStatus === "approved"
                ) {

                    return res.status(400).json({
                        success: false,
                        message:
                            "Your activation request has already been approved."
                    });

                }


                /*
                 * REJECTED:
                 *
                 * Do NOT block the user.
                 *
                 * User can submit a new request.
                 */
            }


            /* =========================
               ACTIVATION AMOUNT
            ========================= */

            let amount =
                ACTIVATION_FEE_PKR;


            if (
                paymentMethod.toLowerCase() ===
                "bep20"
            ) {

                amount = 5.30;

            }


            if (
                paymentMethod.toLowerCase() ===
                "trc20"
            ) {

                amount = 5.50;

            }


            /* =========================
               SCREENSHOT
            ========================= */

            const screenshotPath =
                `/uploads/${req.file.filename}`;


            /* =========================
               SAVE NEW REQUEST
            ========================= */

            const result =
                await db.query(
                    `
                    INSERT INTO activation_payments
                    (
                        user_id,
                        amount,
                        payment_method,
                        transaction_reference,
                        screenshot_path,
                        status
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'pending'
                    )
                    RETURNING
                        id,
                        amount,
                        payment_method,
                        transaction_reference,
                        screenshot_path,
                        status,
                        submitted_at
                    `,
                    [
                        userId,
                        amount,
                        paymentMethod,
                        reference,
                        screenshotPath
                    ]
                );


            const request =
                result.rows[0];


            /* =========================
               SUCCESS
            ========================= */

            res.status(201).json({

                success: true,

                message:
                    "Activation request submitted successfully.",

                request_id:
                    request.id,

                status:
                    request.status

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
   ADMIN DEPOSIT APPROVE
========================================================= */

app.post(
    "/api/admin/deposits/:id/approve",
    requireAdmin,
    async (req, res) => {

        try {

            const depositId =
                Number(req.params.id);

            if (!Number.isInteger(depositId) || depositId <= 0) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid deposit ID."
                });

            }

            /*
             * Approve only if deposit is still pending.
             * Balance is added only once.
             */

            const result = await db.query(
                `
                WITH approved AS (

                    UPDATE deposits
                    SET status = 'approved'
                    WHERE id = $1
                      AND status = 'pending'
                    RETURNING
                        id,
                        user_id,
                        amount

                ),

                updated_user AS (

                    UPDATE users u
                    SET wallet_balance =
                        COALESCE(u.wallet_balance, 0)
                        + a.amount
                    FROM approved a
                    WHERE u.id = a.user_id
                    RETURNING
                        u.id,
                        u.wallet_balance

                )

                SELECT
                    a.id,
                    a.user_id,
                    a.amount,
                    uu.wallet_balance

                FROM approved a

                JOIN updated_user uu
                    ON uu.id = a.user_id
                `,
                [depositId]
            );

            if (!result.rows.length) {

                const check = await db.query(
                    `
                    SELECT
                        id,
                        status
                    FROM deposits
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [depositId]
                );

                if (!check.rows.length) {

                    return res.status(404).json({
                        success: false,
                        message: "Deposit request not found."
                    });

                }

                return res.status(400).json({
                    success: false,
                    message:
                        `Deposit cannot be approved because its current status is "${check.rows[0].status}".`
                });

            }

            const approved =
                result.rows[0];

            /*
             * Record wallet transaction.
             */

            await db.query(
                `
                INSERT INTO transactions
                (
                    user_id,
                    type,
                    amount,
                    description
                )
                VALUES
                (
                    $1,
                    'deposit',
                    $2,
                    $3
                )
                `,
                [
                    approved.user_id,
                    safeNumber(approved.amount),
                    `Deposit #${approved.id} approved`
                ]
            );

            res.json({

                success: true,

                message:
                    "Deposit approved successfully.",

                deposit: {

                    id:
                        approved.id,

                    user_id:
                        approved.user_id,

                    amount:
                        safeNumber(
                            approved.amount
                        ),

                    status:
                        "approved"

                }

            });

        } catch (error) {

            console.error(
                "ADMIN DEPOSIT APPROVE ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to approve deposit."

            });

        }

    }
);


/* =========================================================
   ADMIN DEPOSIT REJECT
========================================================= */

app.post(
    "/api/admin/deposits/:id/reject",
    requireAdmin,
    async (req, res) => {

        try {

            const depositId =
                Number(req.params.id);

            if (!Number.isInteger(depositId) || depositId <= 0) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid deposit ID."
                });

            }

            const result = await db.query(
                `
                UPDATE deposits
                SET status = 'rejected'
                WHERE id = $1
                  AND status = 'pending'
                RETURNING
                    id,
                    user_id,
                    amount,
                    status
                `,
                [depositId]
            );

            if (!result.rows.length) {

                const check = await db.query(
                    `
                    SELECT
                        id,
                        status
                    FROM deposits
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [depositId]
                );

                if (!check.rows.length) {

                    return res.status(404).json({
                        success: false,
                        message: "Deposit request not found."
                    });

                }

                return res.status(400).json({
                    success: false,
                    message:
                        `Deposit cannot be rejected because its current status is "${check.rows[0].status}".`
                });

            }

            res.json({

                success: true,

                message:
                    "Deposit rejected successfully.",

                deposit:
                    result.rows[0]

            });

        } catch (error) {

            console.error(
                "ADMIN DEPOSIT REJECT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

                message:
                    "Unable to reject deposit."

            });

        }

    }
);

/* =========================================================
   ADMIN WITHDRAWAL APPROVE
========================================================= */

app.post(
    "/api/admin/withdrawals/:id/approve",
    requireAdmin,
    async (req, res) => {

        try {

            const withdrawalId =
                Number(req.params.id);

            if (
                !Number.isInteger(withdrawalId) ||
                withdrawalId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid withdrawal ID."
                });

            }

            /* =========================
               APPROVE PENDING WITHDRAWAL
               
               IMPORTANT:
               Wallet was already deducted
               when user submitted request.
               
               DO NOT deduct wallet again.
            ========================= */

            const result =
                await db.query(
                    `
                    UPDATE withdrawals
                    SET status = 'approved'
                    WHERE id = $1
                      AND status = 'pending'
                    RETURNING
                        id,
                        user_id,
                        amount,
                        method,
                        account_number,
                        status,
                        created_at
                    `,
                    [withdrawalId]
                );


            /* =========================
               CHECK RESULT
            ========================= */

            if (!result.rows.length) {

                const check =
                    await db.query(
                        `
                        SELECT
                            id,
                            status,
                            amount
                        FROM withdrawals
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [withdrawalId]
                    );


                if (!check.rows.length) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Withdrawal request not found."
                    });

                }


                const row =
                    check.rows[0];


                return res.status(400).json({
                    success: false,
                    message:
                        `Withdrawal cannot be approved because its current status is "${row.status}".`
                });

            }


            const approved =
                result.rows[0];


            /* =========================
               RECORD TRANSACTION
            ========================= */

            await db.query(
                `
                INSERT INTO transactions
                (
                    user_id,
                    type,
                    amount,
                    description
                )
                VALUES
                (
                    $1,
                    'withdrawal',
                    $2,
                    $3
                )
                `,
                [
                    approved.user_id,

                    safeNumber(
                        approved.amount
                    ),

                    `Withdrawal #${approved.id} approved`
                ]
            );


            /* =========================
               SUCCESS
            ========================= */

            res.json({

                success: true,

                message:
                    "Withdrawal approved successfully.",

                withdrawal: {

                    id:
                        approved.id,

                    user_id:
                        approved.user_id,

                    amount:
                        safeNumber(
                            approved.amount
                        ),

                    method:
                        approved.method,

                    account_number:
                        approved.account_number,

                    status:
                        "approved",

                    created_at:
                        approved.created_at

                }

            });

        } catch (error) {

            console.error(
                "ADMIN WITHDRAWAL APPROVE ERROR:",
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
   ADMIN WITHDRAWAL REJECT
========================================================= */

app.post(
    "/api/admin/withdrawals/:id/reject",
    requireAdmin,
    async (req, res) => {

        try {

            const withdrawalId =
                Number(req.params.id);

            if (
                !Number.isInteger(withdrawalId) ||
                withdrawalId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid withdrawal ID."
                });

            }

            /* =========================
               REJECT + REFUND WALLET
               
               IMPORTANT:
               Amount was already deducted
               when withdrawal was requested.
               
               Therefore on rejection:
               amount is added back.
               
               Only PENDING requests can be
               refunded, preventing double refund.
            ========================= */

            const result =
                await db.query(
                    `
                    WITH pending_withdrawal AS (

                        SELECT
                            id,
                            user_id,
                            amount
                        FROM withdrawals
                        WHERE id = $1
                          AND status = 'pending'

                    ),

                    refunded AS (

                        UPDATE users u

                        SET wallet_balance =
                            COALESCE(u.wallet_balance, 0)
                            + p.amount

                        FROM pending_withdrawal p

                        WHERE u.id = p.user_id

                        RETURNING
                            p.id,
                            p.user_id,
                            p.amount,
                            u.wallet_balance

                    ),

                    rejected AS (

                        UPDATE withdrawals w

                        SET status = 'rejected'

                        FROM refunded r

                        WHERE w.id = r.id
                          AND w.status = 'pending'

                        RETURNING
                            w.id,
                            w.user_id,
                            w.amount,
                            w.status,
                            w.created_at

                    )

                    SELECT
                        r.id,
                        r.user_id,
                        r.amount,
                        r.status,
                        r.created_at,
                        f.wallet_balance

                    FROM rejected r

                    JOIN refunded f
                        ON f.id = r.id
                    `,
                    [withdrawalId]
                );


            /* =========================
               CHECK RESULT
            ========================= */

            if (!result.rows.length) {

                const check =
                    await db.query(
                        `
                        SELECT
                            id,
                            status,
                            amount
                        FROM withdrawals
                        WHERE id = $1
                        LIMIT 1
                        `,
                        [withdrawalId]
                    );


                if (!check.rows.length) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Withdrawal request not found."
                    });

                }


                const row =
                    check.rows[0];


                return res.status(400).json({
                    success: false,
                    message:
                        `Withdrawal cannot be rejected because its current status is "${row.status}".`
                });

            }


            const rejected =
                result.rows[0];


            /* =========================
               SUCCESS
            ========================= */

            res.json({

                success: true,

                message:
                    "Withdrawal rejected and amount refunded successfully.",

                withdrawal: {

                    id:
                        rejected.id,

                    user_id:
                        rejected.user_id,

                    amount:
                        safeNumber(
                            rejected.amount
                        ),

                    status:
                        "rejected",

                    created_at:
                        rejected.created_at

                },

                wallet_balance:
                    safeNumber(
                        rejected.wallet_balance
                    )

            });

        } catch (error) {

            console.error(
                "ADMIN WITHDRAWAL REJECT ERROR:",
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
   ADMIN WITHDRAWALS
========================================================= */

app.get(
    "/api/admin/withdrawals",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await db.query(
                `
                SELECT
                    w.id,
                    w.user_id,
                    w.amount,
                    w.method,
                    w.account_number,
                    w.status,
                    w.created_at,
                    u.full_name,
                    u.username,
                    u.email,
                    u.mobile
                FROM withdrawals w
                JOIN users u
                    ON u.id = w.user_id
                ORDER BY w.id DESC
                `
            );

            res.json({
                success: true,
                withdrawals: result.rows
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
   API 404
========================================================= */

app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found.",
        method: req.method,
        path: req.originalUrl
    });
});

/* =========================================================
   GENERAL 404
========================================================= */

app.use((req, res) => {
    if (req.accepts("html")) {
        return res.status(404).send(
            "<h1>404 - Page Not Found</h1>"
        );
    }

    res.status(404).json({
        success: false,
        message: "Page not found."
    });
});

/* =========================================================
   ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
    console.error(
        "SERVER ERROR:",
        error
    );

    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message:
                error.code === "LIMIT_FILE_SIZE"
                    ? "File size must be 5MB or less."
                    : error.message
        });
    }

    if (error && error.message) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }

    res.status(500).json({
        success: false,
        message: "Internal server error."
    });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `Watch & Earn server running on port ${PORT}`
    );
});

