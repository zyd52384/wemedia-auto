import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; index: string }> };

// Serves a generated XHS image by noteId and image index (0-based)
// URL pattern: /api/xhs-image/[id]/[index]
export async function GET(_req: NextRequest, { params }: Params) {
    const { id, index } = await params;
    const note = await prisma.xhsNote.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    let images: string[] = [];
    try { images = JSON.parse(note.images || '[]'); } catch { /* */ }

    const idx = parseInt(index || '0');
    const imgPath = images[idx];

    if (!imgPath || !fs.existsSync(imgPath)) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const buf = fs.readFileSync(imgPath);
    const ext = path.extname(imgPath).toLowerCase();
    const mimeType = ext === '.webp' ? 'image/webp' : 'image/png';

    return new NextResponse(buf, {
        headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=86400',
        },
    });
}
