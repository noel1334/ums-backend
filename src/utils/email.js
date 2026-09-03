// src/utils/email.js

import nodemailer from 'nodemailer';
import AppError from './AppError.js';
import config from '../config/index.js';

const transporter = nodemailer.createTransport({
    host: config.email.host,       
    port: config.email.port,       
    secure: config.email.port == 465,
    auth: {
        user: config.email.user,   
        pass: config.email.pass,   
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

//export const verifyEmailConnection = async () => {
    // try {
    //     await transporter.verify();
    //     return true;
    // } catch (error) {
    //     console.error("Email transporter verification failed:", error);
    //     return false;
    // }
//};
export const verifyEmailConnection = async () => {
    try {
        await transporter.verify();
        console.log("✅ Email connection verified");
        return true;
    } catch (error) {
        console.error("❌ Email transporter verification failed:", error);
        return false;
    }
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
