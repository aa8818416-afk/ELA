import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type UserRole = "admin" | "distributor" | "farmer";

// Role-to-dashboard mapping
const ROLE_DASHBOARDS: Record<UserRole, string> = {
  admin: "/admin",
  distributor: "/distributor",
  farmer: "/farmer",
};

/**
 * ELA — Role-Based Routing Middleware (100% isolated and Edge-compliant)
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Refresh the session and get the current user
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Apply cookies to the request
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild the response with the updated request cookies
          supabaseResponse = NextResponse.next({ request });
          // Apply cookies to the response
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() contacts the Supabase Auth server to verify the token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 2. Determine route context
  const isLoginPage = pathname === "/login";
  const isAdminRoute = pathname.startsWith("/admin");
  const isDistributorRoute = pathname.startsWith("/distributor");
  const isFarmerRoute = pathname.startsWith("/farmer");
  const isRootRoute = pathname === "/";
  const isProtectedRoute =
    isAdminRoute || isDistributorRoute || isFarmerRoute || isRootRoute;

  // Helper: redirect with preserved response cookies
  function redirectTo(destination: string) {
    const redirectUrl = new URL(destination, request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Preserve any auth cookies set during session refresh
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
      });
    });
    return redirectResponse;
  }

  // 3. Unauthenticated user hitting a protected route → /login
  if (!user && isProtectedRoute) {
    return redirectTo("/login");
  }

  // 4. Authenticated user — fetch their role from the profiles table
  if (user) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      console.error("[Middleware] Profile fetch error:", error?.message);
      return redirectTo("/login");
    }

    const role = profile.role as UserRole;
    const ownDashboard = ROLE_DASHBOARDS[role];

    // 4a. Authenticated user on /login → redirect to their dashboard
    if (isLoginPage) {
      return redirectTo(ownDashboard);
    }

    // 4b. Authenticated user on root → redirect to their dashboard
    if (isRootRoute) {
      return redirectTo(ownDashboard);
    }

    // 4c. Wrong role trying to access another role's route → own dashboard
    if (isAdminRoute && role !== "admin") {
      return redirectTo(ownDashboard);
    }
    if (isDistributorRoute && role !== "distributor") {
      return redirectTo(ownDashboard);
    }
    if (isFarmerRoute && role !== "farmer") {
      return redirectTo(ownDashboard);
    }
  }

  // 5. All checks passed — proceed with the refreshed session response
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run middleware on all routes EXCEPT:
     * - _next/static  (static assets)
     * - _next/image   (Next.js image optimization)
     * - favicon.ico   (browser favicon)
     * - Public static files (png, jpg, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
