import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function getPrisma(): PrismaClient {
    if (!globalForPrisma.prisma) {
        const dbUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
        const adapter = new PrismaLibSql({ url: dbUrl });
        globalForPrisma.prisma = new PrismaClient({ adapter });
    }
    return globalForPrisma.prisma;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        const client = getPrisma();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = (client as any)[prop];
        if (typeof value === 'function') {
            return value.bind(client);
        }
        return value;
    },
});

export default prisma;
