import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    const task = await prisma.scheduledTask.update({
        where: { id },
        data: body,
    });

    return NextResponse.json({ task });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    await prisma.scheduledTask.delete({ where: { id } });
    return NextResponse.json({ success: true });
}
