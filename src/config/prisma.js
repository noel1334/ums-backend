
import { PrismaClient } from '../generated/prisma/index.js';

let prisma;
try {
    prisma = new PrismaClient();
    console.log('Prisma Client initialized successfully from: ../generated/prisma/index.js');
} catch (error) {
    console.error('Failed to initialize Prisma Client from custom path:', error);
    prisma = null;
}
export default prisma;