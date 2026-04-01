import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

export const authClient = createAuthClient({
    baseURL: BACKEND_URL,
    plugins: [
        usernameClient(),
    ],
});

// Export hooks and methods for easier usage
export const {
    signIn,
    signUp,
    signOut,
    useSession,
} = authClient;

