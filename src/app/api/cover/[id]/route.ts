import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * Serve cover image file for an article.
 * GET /api/cover/[id]
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });

    if (!article || !article.coverPath) {
        return NextResponse.json({ error: 'Cover not found' }, { status: 404 });
    }

    // Try the saved cover path
    let coverFile = article.coverPath;
    if (!fs.existsSync(coverFile)) {
        // Try looking for cover.png in the article directory
        const dir = path.dirname(article.filePath);
        const altPath = path.join(dir, 'cover.png');
        if (fs.existsSync(altPath)) {
            coverFile = altPath;
        } else {
            // Try cover.svg
            const svgPath = path.join(dir, 'cover.svg');
            if (fs.existsSync(svgPath)) {
                const svgContent = fs.readFileSync(svgPath);
                return new NextResponse(svgContent, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'public, max-age=86400',
                    },
                });
            }
            return NextResponse.json({ error: 'Cover file not found' }, { status: 404 });
        }
    }

    const ext = path.extname(coverFile).toLowerCase();
    const mimeMap: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
    };

    const contentType = mimeMap[ext] || 'image/png';
    const fileContent = fs.readFileSync(coverFile);

    return new NextResponse(fileContent, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
