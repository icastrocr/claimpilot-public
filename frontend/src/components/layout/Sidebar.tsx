import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  FilePlus,
  Upload,
  Building2,
  Stethoscope,
  Users,
  Settings,
  ChevronDown,
  ChevronRight,
  Moon,
  Sun,
  LogOut,
  Menu,
  X,
  Shield,
  List,
  Receipt,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: { label: string; href: string; icon: React.ReactNode }[];
}

const navigation: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: "Services",
    href: "/services",
    icon: <List className="h-5 w-5" />,
  },
  {
    label: "Claims",
    href: "/claims",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    label: "Generate Claims",
    href: "/claims/generate",
    icon: <Layers className="h-5 w-5" />,
  },
  {
    label: "Reconciliation",
    href: "/reconciliation-reports",
    icon: <Receipt className="h-5 w-5" />,
  },
  {
    label: "Admin",
    icon: <Shield className="h-5 w-5" />,
    children: [
      {
        label: "Insurance",
        href: "/admin/insurance",
        icon: <Building2 className="h-4 w-4" />,
      },
      {
        label: "Providers",
        href: "/admin/providers",
        icon: <Stethoscope className="h-4 w-4" />,
      },
      {
        label: "Dependents",
        href: "/admin/dependents",
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: "Import Documents",
        href: "/import/documents",
        icon: <Upload className="h-4 w-4" />,
      },
      {
        label: "Settings",
        href: "/admin/settings",
        icon: <Settings className="h-4 w-4" />,
      },
    ],
  },
];

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "Admin",
  ]);
  const location = useLocation();
  const { user, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label)
        ? prev.filter((s) => s !== label)
        : [...prev, label]
    );
  };

  const isActive = (href: string) => location.pathname === href;
  const isSectionActive = (item: NavItem) =>
    item.children?.some((c) => location.pathname.startsWith(c.href)) ?? false;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-accent px-6">
        <FileText className="h-7 w-7 text-primary" />
        <span className="text-xl font-bold tracking-tight">ClaimPilot</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navigation.map((item) => {
          if (item.href) {
            return (
              <NavLink
                key={item.label}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                {item.icon}
                {item.label}
              </NavLink>
            );
          }

          const expanded = expandedSections.includes(item.label);
          const sectionActive = isSectionActive(item);

          return (
            <div key={item.label}>
              <button
                onClick={() => toggleSection(item.label)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  sectionActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {expanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              {expanded && item.children && (
                <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-accent pl-3">
                  {item.children.map((child) => (
                    <NavLink
                      key={child.href}
                      to={child.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive(child.href)
                          ? "bg-sidebar-accent font-medium text-sidebar-foreground"
                          : "text-sidebar-muted hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      {child.icon}
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-accent p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
        {user && (
          <div className="rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="text-sm font-medium truncate">{user.handle}</p>
            <p className="text-xs text-sidebar-muted truncate">{user.email}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed left-4 top-4 z-50 rounded-md bg-sidebar p-2 text-sidebar-foreground shadow-lg lg:hidden"
      >
        {mobileOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Menu className="h-5 w-5" />
        )}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
