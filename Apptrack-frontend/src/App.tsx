import { Refine } from "@refinedev/core";
import { DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
    DocumentTitleHandler,
    UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { dataProvider } from "./providers/data";
import Dashboard from "@/pages/dashboard.tsx";
import { ClipboardList, Home, User } from "lucide-react";
import { Layout } from "@/components/refine-ui/layout/layout.tsx";
import ApplicationsList from "@/pages/applications/ApplicationsList.tsx";
import ApplicationsCreate from "@/pages/applications/ApplicationsCreate.tsx";
import Login from "@/pages/auth/Login.tsx";
import Signup from "@/pages/auth/Signup.tsx";
import Profile from "@/pages/Profile.tsx";
import { useSession } from "@/lib/auth-client";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { data: session, isPending } = useSession();

    if (isPending) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

// Auth route wrapper (redirect to home if already logged in)
function AuthRoute({ children }: { children: React.ReactNode }) {
    const { data: session, isPending } = useSession();

    if (isPending) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (session) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

function App() {
    return (
        <BrowserRouter>
            <RefineKbarProvider>
                <ThemeProvider>
                    <DevtoolsProvider>
                        <Refine
                            dataProvider={dataProvider}
                            notificationProvider={useNotificationProvider()}
                            routerProvider={routerProvider}
                            options={{
                                syncWithLocation: true,
                                warnWhenUnsavedChanges: true,
                                projectId: "rU5QXW-YissXg-5PtwMk",
                            }}

                            resources={[
                                {
                                    name: 'dashboard',
                                    list: '/',
                                    meta: { label: 'Home', icon: <Home /> }
                                },
                                {
                                    name: 'applications',
                                    list: '/applications',
                                    create: '/applications/create',
                                    meta: { label: 'Applications', icon: <ClipboardList /> }
                                },
                                {
                                    name: 'profile',
                                    list: '/profile',
                                    meta: { label: 'Profile', icon: <User /> }
                                }
                            ]}
                        >
                            <Routes>
                                {/* Auth routes */}
                                <Route path="/login" element={
                                    <AuthRoute>
                                        <Login />
                                    </AuthRoute>
                                } />
                                <Route path="/signup" element={
                                    <AuthRoute>
                                        <Signup />
                                    </AuthRoute>
                                } />

                                {/* Protected routes */}
                                <Route element={
                                    <ProtectedRoute>
                                        <Layout>
                                            <Outlet />
                                        </Layout>
                                    </ProtectedRoute>
                                }>

                                    <Route path="/" element={<Dashboard />} />

                                    <Route path="/applications">
                                        <Route index element={<ApplicationsList />} />
                                        <Route path="create" element={<ApplicationsCreate />} />
                                    </Route>

                                    <Route path="/profile" element={<Profile />} />

                                </Route>

                            </Routes>
                            <Toaster />
                            <RefineKbar />
                            <UnsavedChangesNotifier />
                            <DocumentTitleHandler />
                        </Refine>
                    </DevtoolsProvider>
                </ThemeProvider>
            </RefineKbarProvider>
        </BrowserRouter>
    );
}

export default App;
