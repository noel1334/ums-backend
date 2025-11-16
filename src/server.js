import app from './app.js';
import config from './config/index.js';
import prisma from './config/prisma.js';
import dotenv from 'dotenv';

dotenv.config()

const PORT = config.port || 3000;

const server = app.listen(PORT, () => {
    console.log(`UMS App running on port ${PORT}...`);
    if (!prisma) {
        console.warn('Warning: Prisma client failed to initialize. Database operations will not work.');
    }
});

process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
    server.close(() => {
        console.log('💥 Process terminated!');
        // Prisma client disconnects automatically on process exit with Prisma 3+
        // if (prisma) await prisma.$disconnect();
        process.exit(0);
    });
});