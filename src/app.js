import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import AppError from './utils/AppError.js';
import globalErrorHandler from './middlewares/errorHandler.middleware.js';
import mainRouter from './routes/index.js';
import { createInitialAdmin } from './services/auth.service.js';
import methodOverride from 'method-override';
import config from './config/index.js';

const app = express();

const corsOptions = {
    origin: (origin, callback) => {
        if (config.allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
};

app.use(cors(corsOptions));

// INCREASE THE LIMIT HERE!
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: true, limit: '300kb' }));

// --- Method Override (Should be after body parsers so it can read req.body) ---
app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

// --- Other Standard Middlewares ---
app.use(helmet());

// Development logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Ensure initial admin account exists (if not in test environment)
if (process.env.NODE_ENV !== 'test') {
    createInitialAdmin().catch(err => console.error("Failed to ensure initial admin:", err));
}

app.use('/', mainRouter);

// --- Error Handling Middlewares (Always last) ---
// Catch-all for 404 Not Found errors
app.use((req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handler
app.use(globalErrorHandler);

export default app;