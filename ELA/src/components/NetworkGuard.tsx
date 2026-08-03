"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * NetworkGuard — detects genuine network failures (fetch couldn't reach server)
 * and redirects to /offline in all pages EXCEPT /farmer/chat.
 *
 * Strategy: intercept the global fetch and detect TypeError network failures.
 * Does NOT use navigator.onLine alone (unreliable for actual connectivity).
 */
export default function NetworkGuard() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Don't intercept in the chat — it handles its own error messages
        if (pathname.startsWith("/farmer/chat")) return;

        const originalFetch = window.fetch;

        window.fetch = async (...args) => {
            try {
                return await originalFetch(...args);
            } catch (err) {
                // Only treat genuine network failures (TypeError: Failed to fetch)
                // NOT AbortError (user cancelled), NOT JSON parse errors
                const isNetworkError =
                    err instanceof TypeError &&
                    (err.message.toLowerCase().includes("fetch") ||
                        err.message.toLowerCase().includes("network") ||
                        err.message.toLowerCase().includes("failed to fetch"));

                if (isNetworkError) {
                    router.push("/offline");
                }

                // Re-throw so callers can handle if needed
                throw err;
            }
        };

        // Restore original fetch on cleanup / route change
        return () => {
            window.fetch = originalFetch;
        };
    }, [pathname, router]);

    // Renders nothing — purely behavioral
    return null;
}
