// src/services/token.service.js

import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import config from '../config/index.js';
import AppError from '../utils/AppError.js';

/**
 * Helper to delete all expired refresh tokens from the database.
 */
const cleanupExpiredTokens = async () => {
    try {
        await prisma.refreshToken.deleteMany({
            where: { expiresAt: { lt: new Date() } }
        });
    } catch (error) {
        console.error('[TOKEN_CLEANUP_ERROR] Failed to purge expired refresh tokens:', error.message);
    }
};

/**
 * Generate Access and Refresh Token pair and store Refresh Token in DB.
 */
export const generateAuthTokens = async (userId, userType) => {
    // Purge any stale/expired tokens from the database
    await cleanupExpiredTokens();

    const accessTokenPayload = { userId, type: userType };
    const refreshTokenPayload = { userId, type: userType, tokenType: 'refresh' };

    // UPDATED: Short-lived Access Token increased from 15m to 8 Hours
    const accessToken = jwt.sign(accessTokenPayload, config.jwtSecret, { expiresIn: '8h' });

    // UPDATED: Long-lived Refresh Token increased from 7d to 30 Days
    const refreshTokenSecret = config.jwtRefreshSecret || (config.jwtSecret + '_refresh');
    const refreshToken = jwt.sign(refreshTokenPayload, refreshTokenSecret, { expiresIn: '30d' });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiration date

    // Store in database
    await prisma.refreshToken.create({
        data: {
            token: refreshToken,
            userId,
            userType,
            expiresAt
        }
    });

    return {
        accessToken,
        refreshToken
    };
};

/**
 * Verify Refresh Token, revoke old token, and issue a fresh pair (Token Rotation).
 */
export const refreshAuthTokens = async (providedRefreshToken) => {
    if (!providedRefreshToken) {
        throw new AppError('Refresh token is required.', 400);
    }

    // Purge any stale/expired tokens from the database
    await cleanupExpiredTokens();

    const refreshTokenSecret = config.jwtRefreshSecret || (config.jwtSecret + '_refresh');
    let decoded;

    try {
        decoded = jwt.verify(providedRefreshToken, refreshTokenSecret);
    } catch (error) {
        // Automatically delete the expired token from DB if present
        await prisma.refreshToken.deleteMany({
            where: { token: providedRefreshToken }
        });
        throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
    }

    // Check if token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
        where: { token: providedRefreshToken }
    });

    if (!storedToken) {
        // Reuse Detection: If a token is reused after deletion, revoke all tokens for this user for security
        await prisma.refreshToken.deleteMany({
            where: { userId: decoded.userId, userType: decoded.type }
        });
        throw new AppError('Security Alert: Refresh token reuse detected. All sessions revoked. Please log in again.', 401);
    }

    // Check if stored token has passed its expiration date in DB
    if (new Date() > new Date(storedToken.expiresAt)) {
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });
        throw new AppError('Session expired. Please log in again.', 401);
    }

    // Delete used refresh token (Rotation)
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    // Issue brand new token pair
    return await generateAuthTokens(decoded.userId, decoded.type);
};

/**
 * Revoke a refresh token on user logout.
 */
export const revokeRefreshToken = async (providedRefreshToken) => {
    if (!providedRefreshToken) return;
    try {
        await prisma.refreshToken.delete({ where: { token: providedRefreshToken } });
    } catch (error) {
        // Token might already be deleted or expired
    }
};