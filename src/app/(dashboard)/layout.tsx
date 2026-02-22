"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/authStore";
import {
    LayoutDashboard,
    Package,
    FileText,
    ShoppingBag,
    Settings,
    LogOut,
    User as UserIcon,
    Users,
    Wallet,
    FileSearch,
    Wrench,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading, logout } = useAuthStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        // Simple Auth Guard
        if (!loading && !user) {
            // router.push("/login"); // Commented out for dev if needed, logic is:
        }
        // We should rely on a more robust persistence check or middleware, 
        // but for this SPA client-side guard:
        const checkAuth = async () => {
            // give store a moment to rehydrate if needed
            // but since we use persist middleware, it's usually instant or 'loading'
        }
    }, [user, loading, router]);

    // Prevent hydration mismatch or flash of content
    if (!isMounted) return null;

    // if (!user) return null; // Or a loading spinner

    const navItems = [
        { href: "/", label: "Overview", icon: LayoutDashboard },
        { href: "/jobs", label: "Jobs", icon: Wrench },
        { href: "/customers", label: "Customers", icon: Users },
        { href: "/finance", label: "Finance", icon: Wallet },
        { href: "/analytics", label: "Analytics", icon: BarChart3 },
        { href: "/inventory", label: "Inventory", icon: Package },
        { href: "/marketplace/orders", label: "Marketplace Orders", icon: ShoppingBag },
        { href: "/settings", label: "Settings", icon: Settings }, // Optional
    ];

    return (
        <div className="flex h-screen bg-gray-100">
            {/* Sidebar */}
            <aside className="hidden w-64 flex-col border-r bg-white md:flex">
                <div className="p-6">
                    <div className="flex items-center gap-3">
                        <Avatar>
                            <AvatarImage src="" />
                            <AvatarFallback className="bg-black text-white">
                                {user?.name?.charAt(0) || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">{user?.name || "User"}</span>
                            <span className="text-xs text-gray-500 capitalize">{user?.role || "Staff"}</span>
                        </div>
                    </div>
                </div>
                <Separator />
                <nav className="flex-1 space-y-1 p-4">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-100 hover:text-gray-900",
                                    isActive ? "bg-gray-100 text-gray-900" : "text-gray-900/70"
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
                <div className="p-4 border-t">
                    <Button variant="outline" className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50" onClick={() => {
                        logout();
                        router.push("/login");
                    }}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-0">
                {children}
            </main>
        </div>
    );
}
