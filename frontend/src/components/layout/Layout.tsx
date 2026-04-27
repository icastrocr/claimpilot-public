import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { Toaster } from "@/components/ui/toast";

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-7xl px-4 py-6 lg:px-8">
          <Outlet />
        </div>
      </main>
      <Toaster />
    </div>
  );
}
