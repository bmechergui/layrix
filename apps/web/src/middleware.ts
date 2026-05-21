import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/shared/lib/supabase-middleware';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  if (process.env.NODE_ENV === 'development') {
    return response;
  }

  // Validate JWT server-side — getUser() is safer than getSession()
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
