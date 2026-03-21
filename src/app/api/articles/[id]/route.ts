import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });

    if (!article) {
        return NextResponse.json({ error: 'Article not found' }, { status: 404 });
    }

    // Read markdown content
    let content = '';
    if (article.filePath && fs.existsSync(article.filePath)) {
        content = fs.readFileSync(article.filePath, 'utf-8');
    }

    // Check humanized version with fallback logic
    let humanizedContent = '';
    if (article.humanized) {
        const deAiPath = article.filePath.replace('article.md', 'article-de-ai.md');
        const humanizedPath = article.filePath.replace('article.md', 'article-humanized.md');

        if (fs.existsSync(deAiPath)) {
            humanizedContent = fs.readFileSync(deAiPath, 'utf-8');
        } else if (fs.existsSync(humanizedPath)) {
            humanizedContent = fs.readFileSync(humanizedPath, 'utf-8');
        } else {
            humanizedContent = content;
        }
    }

    // Extract alternative titles from frontmatter
    const titlesMatch = content.match(/titles:\n([\s\S]*?)(?=---|\n\w)/);
    let titles: string[] = [];
    if (titlesMatch) {
        titles = titlesMatch[1]
            .split('\n')
            .map(l => l.replace(/^\s*-\s*"?/, '').replace(/"?\s*$/, ''))
            .filter(Boolean);
    }

    return NextResponse.json({
        ...article,
        content,
        humanizedContent,
        titles,
        hasCover: article.coverPath ? fs.existsSync(article.coverPath) : false,
    });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    await prisma.article.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
