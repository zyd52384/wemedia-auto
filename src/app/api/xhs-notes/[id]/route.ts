import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

function parseNoteFile(filePath: string): { mdContent: string } {
    try {
        if (!fs.existsSync(filePath)) return { mdContent: '' };
        return { mdContent: fs.readFileSync(filePath, 'utf-8') };
    } catch {
        return { mdContent: '' };
    }
}

export async function GET(_req: NextRequest, { params }: Params) {
    const { id } = await params;
    const note = await prisma.xhsNote.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { mdContent } = parseNoteFile(note.filePath);

    return NextResponse.json({ ...note, mdContent });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
    const { id } = await params;
    const note = await prisma.xhsNote.findUnique({ where: { id } });
    if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Optionally remove generated files
    try {
        const images: string[] = JSON.parse(note.images || '[]');
        images.forEach(imgPath => {
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        });
    } catch { /* ignore */ }

    await prisma.xhsNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
