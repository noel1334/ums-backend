// src/utils/jwt.utils.js

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

// Ensure these secrets are strong and stored securely (e.g., in .env)
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'your_strong_access_token_secret_here';
const EXAM_ACCESS_TOKEN_SECRET = process.env.EXAM_ACCESS_TOKEN_SECRET || 'your_strong_exam_access_token_secret_here'; // NEW SECRET for exam access

export const generateAccessToken = (payload) => {
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '1d' }); // General access token
};

export const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, ACCESS_TOKEN_SECRET);
    } catch (error) {
        return null; // Token invalid or expired
    }
};

// --- NEW: Functions for Exam-Specific Access Tokens ---
export const generateExamAccessToken = (payload) => {
    // Payload should typically include { userId, examId }
    // Set a short expiry, e.g., 15 minutes, after which the user must re-enter the password.
    return jwt.sign(payload, EXAM_ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};

export const verifyExamAccessToken = (token) => {
    try {
        return jwt.verify(token, EXAM_ACCESS_TOKEN_SECRET);
    } catch (error) {
        // Log the error for debugging, but return null for invalid/expired
        console.warn('Exam Access Token Verification Failed:', error.message);
        return null;
    }
};