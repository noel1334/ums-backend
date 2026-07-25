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

export const sendEmail = async (options) => {
    const mailOptions = {
        from: options.from || `"${config.email.from}" <${config.email.user}>`, 
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || ''
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error(`Nodemailer error sending to ${options.to}:`, error.message);
        throw new AppError(`Email delivery failed: ${error.message}`, 502);
    }
};