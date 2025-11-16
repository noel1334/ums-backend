import nodemailer from 'nodemailer';
import AppError from './AppError.js';
import config from '../config/index.js'

const transporter = nodemailer.createTransport({
    host: config.email.host,       // Use config.email.host
    port: config.email.port,       // Use config.email.port
    secure: config.email.port == 465,
    auth: {
        user: config.email.user,   // Use config.email.user
        pass: config.email.pass,   // Use config.email.pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

export const verifyEmailConnection = async () => {
    // ... (This function remains the same)
};

export const sendEmail = async (options) => {
    const mailOptions = {
        from: `UniCT Hub Admissions <${config.email.from}>`, // Use config.email.from
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || ''
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error(`Nodemailer error sending to ${options.to}:`, error);
        throw new AppError('The email server failed to send the email. Check credentials and connection.', 502);
    }
};