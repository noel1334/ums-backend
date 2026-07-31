// app.js

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit'; // Added rate limit import
import AppError from './utils/AppError.js';
import globalErrorHandler from './middlewares/errorHandler.middleware.js';
import mainRouter from './routes/index.js';
import { createInitialAdmin } from './services/auth.service.js';
import methodOverride from 'method-override';
import config from './config/index.js';

const app = express();

// --- RATE LIMITING CONFIGURATION ---
// Restricts IPs from spamming API endpoints while allowing standard dashboard traffic
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes window
    max: 500, // Allows up to 500 requests per 15 minutes (prevents portal throttling on page loads)
    standardHeaders: true, 
    legacyHeaders: false, 
    message: {
        status: 'fail',
        message: 'Too many requests from this IP address, please try again after 15 minutes.'
    }
});

const corsOptions = {
    origin: (origin, callback) => {
        // Strip trailing slash from browser origin header if present
        const cleanOrigin = origin ? origin.replace(/\/+$/, '') : null;
        
        if (!cleanOrigin || config.allowedOrigins.includes(cleanOrigin) || config.allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.error(`[CORS Blocked] Origin '${origin}' is not listed in allowedOrigins:`, config.allowedOrigins);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
};

app.use(cors(corsOptions));

// Apply rate limiting middleware to all /api endpoints
app.use('/api', limiter);

app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: true, limit: '300kb' }));

app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

app.use(helmet());

if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

if (process.env.NODE_ENV !== 'test') {
    createInitialAdmin().catch(err => console.error("Failed to ensure initial admin:", err));
}

// 1. Root route welcome message
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Welcome to the UMS API'
    });
});

// 2. Mount Main Router
app.use('/', mainRouter);

// 3. Catch-all for 404 Not Found errors (Must be placed AFTER all routes)
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// 4. Global error handler (Always last)
app.use(globalErrorHandler);

export default app;