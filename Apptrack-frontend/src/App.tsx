import { Refine } from "@refinedev/core";
import { DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
    DocumentTitleHandler,
    UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { dataProvider } from "./providers/data";
import Dashboard from "@/pages/dashboard.tsx";
import { FileCheck, Home, TrendingUp, ReceiptText } from "lucide-react";
import { Layout } from "@/components/refine-ui/layout/layout.tsx";
import DealsList from "@/pages/deals/DealsList.tsx";
import DealsCreate from "@/pages/deals/DealsCreate.tsx";
import DealsShow from "@/pages/deals/DealsShow.tsx";
import Pipeline from "@/pages/Pipeline.tsx";
import InvoicesList from "@/pages/invoices/InvoicesList.tsx";

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
                                title: {
                                    text: 'Northwoods',
                                    icon: <FileCheck className="h-5 w-5 text-primary" />,
                                },
                            }}
                            resources={[
                                {
                                    name: 'dashboard',
                                    list: '/',
                                    meta: { label: 'Home', icon: <Home /> }
                                },
                                {
                                    name: 'deals',
                                    list: '/deals',
                                    create: '/deals/create',
                                    show: '/deals/:id',
                                    meta: { label: 'Deals', icon: <FileCheck /> }
                                },
                                {
                                    name: 'pipeline',
                                    list: '/pipeline',
                                    meta: { label: 'Pipeline', icon: <TrendingUp /> }
                                },
                                {
                                    name: 'invoices',
                                    list: '/invoices',
                                    meta: { label: 'Invoices', icon: <ReceiptText /> }
                                },
                            ]}
                        >
                            <Routes>
                                <Route element={<Layout><Outlet /></Layout>}>
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/deals">
                                        <Route index element={<DealsList />} />
                                        <Route path="create" element={<DealsCreate />} />
                                        <Route path=":id" element={<DealsShow />} />
                                    </Route>
                                    <Route path="/pipeline" element={<Pipeline />} />
                                    <Route path="/invoices" element={<InvoicesList />} />
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
