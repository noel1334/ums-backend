// src/middlewares/validate.middleware.js

import AppError from '../utils/AppError.js';

/**
 * Higher-order middleware to validate incoming request data against a Zod schema.
 * @param {import('zod').ZodSchema} schema - Zod validation schema
 */
export const validate = (schema) => (req, res, next) => {
    try {
        const parsed = schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });

        // Update body and params directly
        if (parsed.body) req.body = parsed.body;
        if (parsed.params) req.params = parsed.params;

        if (parsed.query) {
            Object.assign(req.query, parsed.query);
        }

        next();
    } catch (error) {
        if (error.name === 'ZodError' || error.issues) {
            // FIXED: Safely retrieve issue array using error.issues
            const issues = error.issues || error.errors || [];
            const errorMessages = issues.length > 0
                ? issues.map(err => `${err.path.join('.')}: ${err.message}`).join('; ')
                : 'Invalid request payload';
                
            return next(new AppError(`Validation Error: ${errorMessages}`, 400));
        }
        next(error);
    }
};