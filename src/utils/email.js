// src/utils/email.js

import nodemailer from 'nodemailer';
import AppError from './AppError.js';
import config from '../config/index.js';

// Safely parse port as an integer
const smtpPort = parseInt(config.email.port, 10) || 587;

const transporter = nodemailer.createTransport({
    host: config.email.host,       
    port: smtpPort,       
    secure: smtpPort === 465, // True for port 465, false for port 587
    auth: {
        user: config.email.user,   
        pass: config.email.pass,   
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000
});

export const verifyEmailConnection = async () => {
    // try {
    //     await transporter.verify();
    //     return true;
    // } catch (error) {
    //     console.error("Email transporter verification failed:", error);
    //     return false;
    // }
};

export const sendEmail = async (options) => {
    const mailOptions = {
        // ALLOW DYNAMIC SENDER OVERRIDE:
        from: options.from || `UniCT Hub Admissions <${config.email.from}>`, 
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