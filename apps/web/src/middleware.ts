import { type NextRequest, NextResponse } from 'next/server';
import { createMiddlewareClient } from '@/shared/lib/supabase-middleware';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createMiddlewareClient(request);

  // Validate JWT server-side — getUser() is safer than getSession()
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/', request.url);
    loginUrl.searchParams.set('redirected', '1');
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
