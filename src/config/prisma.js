// src/config/prisma.js
import { PrismaClient } from '../generated/prisma/index.js';
import dotenv from 'dotenv'; // Import dotenv to load environment variables

// Load environment variables from .env file
dotenv.config();

let prisma;

// Recommended pattern for Next.js and other environments with hot-reloading
// This prevents multiple PrismaClient instances in development.
if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    // Pass the DATABASE_URL directly to the PrismaClient constructor
    datasourceUrl: process.env.DATABASE_URL,
  });
} else {
  // In development, store PrismaClient on the global object
  // to prevent re-instantiation on hot-reloads.
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      // Pass the DATABASE_URL directly to the PrismaClient constructor
      datasourceUrl: process.env.DATABASE_URL,
    });
  }
  prisma = global.prisma;
}

export default prisma;