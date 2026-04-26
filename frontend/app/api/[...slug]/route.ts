import type { NextRequest } from 'next/server'

const API_URL = process.env.API_URL ?? 'http://backend:8000'

async function handler(request: NextRequest) {
    const path = request.nextUrl.pathname.replace(/^\/api/, '')
    const target = new URL(`${path}${request.nextUrl.search}`, API_URL)
    return fetch(new Request(target, request))
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
