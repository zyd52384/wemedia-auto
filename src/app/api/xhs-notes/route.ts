import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;
    const titleQ = searchParams.get('title') || '';
    const statusQ = searchParams.get('status') || '';

    const where: Record<string, unknown> = {};
    if (titleQ) where.title = { contains: titleQ };
    if (statusQ) where.status = statusQ;

    const [notes, total] = await Promise.all([
        prisma.xhsNote.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        }),
        prisma.xhsNote.count({ where }),
    ]);

    return NextResponse.json({ notes, total, page, limit });
}
