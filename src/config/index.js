import dotenv from 'dotenv';

try {
    dotenv.config();
} catch (error) {
    console.error("Error loading .env file. Ensure it exists and is readable.", error);
    // Consider exiting if essential configs are missing
    // process.exit(1);
}

const allowedOrigins = [
    process.env.STUDENT_PORTAL_URL,
    process.env.LECTURER_URL,
    process.env.ICT_URL,
    process.env.ADMIN_URL,
    process.env.SCREENING_PORTAL_URL,
    process.env.EXAM_URL,
    process.env.IMGBB_API_KEY
].filter(Boolean); // Using filter(Boolean) will remove any undefined or empty values

const config = {
    port: process.env.PORT || 3000,
    jwtSecret: process.env.JWT_SECRET,
    databaseUrl: process.env.DATABASE_URL,
    lecturerDefaultPassword: process.env.LECTURER_DEFAULT_PASSWORD,
    ictStaffDefaultPassword: process.env.ICTSTAFF_DEFAULT_PASSWORD,
    studentDefaultPassword: process.env.STUDENT_DEFAULT_PASSWORD,
    onlineScreeningDefaultPassword: process.env.ONLINE_SCREENING_DEFAULT_PASSWORD,
    imgbbApiKey: process.env.IMGBB_API_KEY,
    allowedOrigins: allowedOrigins, // Add the array of frontend URLs

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
    paystack:process.env.PAYSTACK_SECRET_KEY,
    strip:process.env.STRIPE_SECRET_KEY,
    studentPortalUrl: process.env.STUDENT_PORTAL_URL || 'http://localhost:8080/student-login',
    screeningPortalUrl: process.env.SCREENING_PORTAL_URL || 'http://localhost:8084/screening-login',


};

if (!config.email.host || !config.email.port || !config.email.user || !config.email.pass || !config.email.from) {
    console.error("FATAL ERROR: Email configuration (HOST, PORT, USERNAME, PASSWORD, FROM) is incomplete in the .env file.");
    process.exit(1);
}

if (!config.lecturerDefaultPassword) {
    console.warn("WARNING: LECTURER_DEFAULT_PASSWORD is not defined in .env. Default password feature will not work as intended if a password is not provided during lecturer creation.");
    console.error("FATAL ERROR: LECTURER_DEFAULT_PASSWORD is not defined...");
    process.exit(1);
}
if (!config.onlineScreeningDefaultPassword) {
    console.warn("WARNING: ONLINE_SCREENING_DEFAULT_PASSWORD is not defined in .env. A password must be provided during screening account creation if this is not set.");
    console.error("FATAL ERROR: ONLINE_SCREENING_DEFAULT_PASSWORD is not defined...");
    process.exit(1);
}
if (!config.ictStaffDefaultPassword) {
    console.warn("WARNING: ICTSTAFF_DEFAULT_PASSWORD is not defined in .env. Default password feature for ICT staff will require a password to be provided during creation if this is not set.");
    console.error("FATAL ERROR: ICTSTAFF_DEFAULT_PASSWORD is not defined...");
    process.exit(1);
}
if (!config.studentDefaultPassword) {
    console.warn("WARNING: STUDENT_DEFAULT_PASSWORD is not defined in .env. A password must be provided during student creation if this is not set.");
    console.error("FATAL ERROR: STUDENT_DEFAULT_PASSWORD is not defined...");
    process.exit(1);

}
if (!config.imgbbApiKey) {
    console.warn("Warning: IMGBB_API_KEY is not defined. Image uploads will fail.");
}
if (!config.jwtSecret) {
    console.error("FATAL ERROR: JWT_SECRET is not defined. Please set it in your .env file.");
    process.exit(1);
}
if (!config.databaseUrl) {
    console.error("FATAL ERROR: DATABASE_URL is not defined. Please set it in your .env file.");
    process.exit(1);
}


export default config;