// src/config/index.js

import dotenv from 'dotenv';

try {
    dotenv.config();
} catch (error) {
    console.error("Error loading .env file. Ensure it exists and is readable.", error);
}

// Helper to strip trailing slashes from origin URLs
const sanitizeOrigin = (url) => url ? url.trim().replace(/\/+$/, '') : null;

const allowedOrigins = [
    sanitizeOrigin(process.env.STUDENT_PORTAL_URL),
    sanitizeOrigin(process.env.LECTURER_URL),
    sanitizeOrigin(process.env.ICT_URL),
    sanitizeOrigin(process.env.ADMIN_URL),
    sanitizeOrigin(process.env.SCREENING_PORTAL_URL),
    sanitizeOrigin(process.env.EXAM_URL),
    // Production Vercel domains
    'https://ums-admin-dashboard.vercel.app',
    'https://uni-ict-hub-dashboard.vercel.app',
    'https://students-three-kappa.vercel.app',
    'https://uni-lecturer-hub.vercel.app',
    'https://onlinescreenin-student-hub.vercel.app',
    'https://ums-cbt.vercel.app',
    // Local Development Fallbacks
    'http://localhost:8080',
    'http://localhost:8081',
    'http://localhost:8082',
    'http://localhost:8083',
    'http://localhost:8084',
    'http://localhost:8085',
    'http://localhost:5173',
].filter(Boolean);

const config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    lecturerDefaultPassword: process.env.LECTURER_DEFAULT_PASSWORD,
    ictStaffDefaultPassword: process.env.ICTSTAFF_DEFAULT_PASSWORD,
    studentDefaultPassword: process.env.STUDENT_DEFAULT_PASSWORD,
    onlineScreeningDefaultPassword: process.env.ONLINE_SCREENING_DEFAULT_PASSWORD,
    imgbbApiKey: process.env.IMGBB_API_KEY,
    allowedOrigins: allowedOrigins,

    email: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
        from: process.env.EMAIL_FROM,
    },

    admin: {
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        name: process.env.ADMIN_NAME,
        phone: process.env.ADMIN_PHONE,
        role: process.env.ADMIN_ROLE || 'superAdmin',
        location: process.env.ADMIN_LOCATION,
        isPermittedToAddAdmin: process.env.ADMIN_IS_PERMITTED_TO_ADD_ADMIN === 'true',
    },
    flutterwave: {
        publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY,
        secretKey: process.env.FLUTTERWAVE_SECRET_KEY,
        secretHash: process.env.FLW_SECRET_HASH,
    },
    paystack: process.env.PAYSTACK_SECRET_KEY,
    strip: process.env.STRIPE_SECRET_KEY,
    studentPortalUrl: process.env.STUDENT_PORTAL_URL || 'http://localhost:8080/student-login',
    screeningPortalUrl: process.env.SCREENING_PORTAL_URL || 'http://localhost:8084/screening-login',
};

if (!config.email.host || !config.email.port || !config.email.user || !config.email.pass || !config.email.from) {
    console.error("FATAL ERROR: Email configuration is incomplete in .env.");
    process.exit(1);
}
if (!config.jwtSecret) {
    console.error("FATAL ERROR: JWT_SECRET is not defined in .env.");
    process.exit(1);
}
if (!config.databaseUrl) {
    console.error("FATAL ERROR: DATABASE_URL is not defined in .env.");
    process.exit(1);
}

export default config;