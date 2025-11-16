import AppError from '../utils/AppError.js';

const handlePrismaError = (err) => {
    // Handle known Prisma errors, e.g., unique constraint violation
    if (err.code === 'P2002') { // Unique constraint failed
        const target = err.meta && err.meta.target ? err.meta.target.join(', ') : 'field';
        return new AppError(`A record with this ${target} already exists.`, 409); // 409 Conflict
    }
    // Add more Prisma error codes as needed
    return new AppError('Something went wrong with the database operation.', 500);
};


const globalErrorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    console.error('ERROR 💥', err);

    if (err.name === 'JsonWebTokenError') {
        err = new AppError('Invalid token. Please log in again.', 401);
    }
    if (err.name === 'TokenExpiredError') {
        err = new AppError('Your token has expired. Please log in again.', 401);
    }

    // Handle Prisma specific errors
    if (err.constructor.name === 'PrismaClientKnownRequestError') {
        err = handlePrismaError(err);
    }
    // Add more specific error handlers here (e.g., CastError from Mongoose if you were using it)

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack, error: err }),
    });
};

export default globalErrorHandler;