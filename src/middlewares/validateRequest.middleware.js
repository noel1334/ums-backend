
import AppError from '../utils/AppError.js';

const handlePrismaError = (err) => {
    // Unique constraint violation
    if (err.code === 'P2002') {
        const fields = err.meta?.target?.join(', ');
        return new AppError(`Duplicate field value: ${fields}. Please use another value!`, 400);
    }
    // Record to update/delete does not exist
    if (err.code === 'P2025') {
        return new AppError(`Record not found. ${err.meta?.cause || ''}`, 404);
    }
    // Foreign key constraint failed
    if (err.code === 'P2003') {
        const fieldName = err.meta?.field_name;
        return new AppError(`Invalid input for related field: ${fieldName}. The referenced record does not exist.`, 400);
    }
    // Add more Prisma error codes as needed
    return new AppError('Something went wrong with the database operation.', 500);
};


const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    console.error('ERROR 💥', err);

    if (err.name === 'JsonWebTokenError') err = new AppError('Invalid token. Please log in again!', 401);
    if (err.name === 'TokenExpiredError') err = new AppError('Your token has expired! Please log in again.', 401);

    // Handle Prisma client known errors
    if (err.constructor.name === 'PrismaClientKnownRequestError') {
        err = handlePrismaError(err);
    }


    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        ...(process.env.NODE_ENV === 'development' && { error: err, stack: err.stack }),
    });
};

export default errorHandler;