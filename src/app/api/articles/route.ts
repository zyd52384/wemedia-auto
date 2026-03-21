import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const writerStyle = searchParams.get('writerStyle');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (status) where.status = status;
    if (writerStyle) where.writerStyle = writerStyle;
    if (search) {
        where.OR = [
            { title: { contains: search } },
            { keyword: { contains: search } },
        ];
    }

    const [articles, total] = await Promise.all([
        prisma.article.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        }),
        prisma.article.count({ where }),
    ]);

    // Add cover image availability info
    const articlesWithCover = articles.map(a => ({
        ...a,
        hasCover: a.coverPath ? fs.existsSync(a.coverPath) : false,
    }));

    return NextResponse.json({
        articles: articlesWithCover,
        total,
        page,
        pages: Math.ceil(total / limit),
    });
}

export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.article.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
