// src/utils/email.js

import nodemailer from 'nodemailer';
import AppError from './AppError.js';
import config from '../config/index.js';

// Default to port 465 if not set
const smtpPort = parseInt(config.email.port, 10) || 465;

// Configured with connection pooling for stable batch email dispatches on cloud hosts
const transporter = nodemailer.createTransport({
    host: config.email.host || 'smtp.gmail.com',       
    port: smtpPort,       
    secure: smtpPort === 465, // True for port 465 (SSL)
    pool: true,              // Reuses the TCP connection across batch items
    maxConnections: 5,
    maxMessages: 100,
    auth: {
        user: config.email.user,   
        pass: config.email.pass,   
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000
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