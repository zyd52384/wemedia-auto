import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
    const tasks = await prisma.scheduledTask.findMany({
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { articles: true } } },
    });
    return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { name, keywords, cronExpr, useHumanizer = false } = body;

    if (!name || !keywords || !cronExpr) {
        return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    const task = await prisma.scheduledTask.create({
        data: {
            name,
            keywords: JSON.stringify(keywords),
            cronExpr,
            useHumanizer,
        },
    });

    return NextResponse.json({ task });
}
