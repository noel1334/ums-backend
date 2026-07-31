// src/validations/auth.validation.js

import { z } from 'zod';

// Admin Login Schema
export const adminLoginSchema = z.object({
    body: z.object({
        email: z.string({ required_error: 'Email is required' }).trim().email('Invalid email address format'),
        password: z.string({ required_error: 'Password is required' }).min(1, 'Password cannot be empty'),
    })
});

// Generic Identifier Login Schema
export const identifierLoginSchema = z.object({
    body: z.object({
        identifier: z.string({ required_error: 'Identifier is required' }).trim().min(1, 'Identifier cannot be empty'),
        password: z.string({ required_error: 'Password is required' }).min(1, 'Password cannot be empty'),
    })
});

// Applicant Screening Login Schema
export const applicantLoginSchema = z.object({
    body: z.object({
        jambRegNo: z.string().trim().optional(),
        identifier: z.string().trim().optional(),
        password: z.string({ required_error: 'Password is required' }).min(1, 'Password cannot be empty'),
    }).refine(data => data.jambRegNo || data.identifier, {
        message: "Either JAMB Reg No or Identifier is required",
        path: ["jambRegNo"]
    })
});

// Password Reset Request Schema
export const forgotPasswordSchema = z.object({
    body: z.object({
        identifier: z.string({ required_error: 'Email, Registration Number, or Staff ID is required' }).trim().min(1, 'Identifier is required')
    })
});

// Reset Password Execution Schema
export const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string({ required_error: 'Reset token is required' }).trim().min(1, 'Token is required'),
        newPassword: z.string({ required_error: 'New password is required' }).min(6, 'Password must be at least 6 characters long')
    })
});

// FIXED: Flexible CBT Exam Schedule Login Schema (Accepts accessPassword, providedAccessPassword, or password)
export const examScheduleLoginSchema = z.object({
    body: z.object({
        regNo: z.string({ required_error: 'Registration number is required' }).trim().min(1, 'Registration number cannot be empty'),
        accessPassword: z.string().trim().optional(),
        providedAccessPassword: z.string().trim().optional(),
        password: z.string().trim().optional(),
    }).refine(data => data.accessPassword || data.providedAccessPassword || data.password, {
        message: "Access password is required",
        path: ["accessPassword"]
    })
});

// FIXED: Flexible CBT Exam Session Access Schema
export const examSessionAccessSchema = z.object({
    body: z.object({
        regNo: z.string({ required_error: 'Registration number is required' }).trim().min(1, 'Registration number cannot be empty'),
        examSessionId: z.union([z.number(), z.string({ required_error: 'Exam session ID is required' })]),
        accessPassword: z.string().trim().optional(),
        providedAccessPassword: z.string().trim().optional(),
        password: z.string().trim().optional(),
    }).refine(data => data.accessPassword || data.providedAccessPassword || data.password, {
        message: "Access password is required",
        path: ["accessPassword"]
    })
});