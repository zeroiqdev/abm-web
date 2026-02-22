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
    Menu,
    Users,
    Wallet,
    Wrench,
    BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageLoader } from "@/components/ui/page-loader";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, loading, logout, initialized } = useAuthStore();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (isMounted && initialized && !loading && !user) {
            router.push("/login/");
        }
    }, [user, loading, router, isMounted, initialized]);

    if (!isMounted) return null;

    if (!initialized) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-gray-50">
                <PageLoader message="Initializing session..." />
            </div>
        );
    }

    if (!user && !loading) return null;


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
        <div className="flex h-screen bg-gray-100 overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden w-64 flex-col border-r bg-white md:flex">
                <SidebarContent
                    user={user}
                    pathname={pathname}
                    navItems={navItems}
                    onLogout={() => {
                        logout();
                        router.push("/login/");
                    }}
                />
            </aside>

            {/* Main Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden">
                {/* Mobile Header */}
                <header className="flex h-16 items-center justify-between border-b bg-white px-4 md:hidden">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-black text-white text-xs">
                                {user?.name?.charAt(0) || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-bold truncate max-w-[120px]">{user?.name}</span>
                    </div>

                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-72">
                            <SheetHeader className="sr-only">
                                <SheetTitle>Navigation Menu</SheetTitle>
                            </SheetHeader>
                            <SidebarContent
                                user={user}
                                pathname={pathname}
                                navItems={navItems}
                                onLogout={() => {
                                    logout();
                                    router.push("/login/");
                                }}
                            />
                        </SheetContent>
                    </Sheet>
                </header>

                <main className="flex-1 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}

function SidebarContent({ user, pathname, navItems, onLogout }: any) {
    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-6">
                <div className="flex items-center gap-3">
                    <Avatar>
                        <AvatarImage src="" />
                        <AvatarFallback className="bg-black text-white text-xs">
                            {user?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-gray-900 truncate">{user?.name || "User"}</span>
                        <span className="text-xs text-gray-500 capitalize">{user?.role || "Staff"}</span>
                    </div>
                </div>
            </div>
            <Separator />
            <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
                {navItems.map((item: any) => {
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
                <Button
                    variant="outline"
                    className="w-full justify-start text-red-600 hover:text-red-600 hover:bg-red-50"
                    onClick={onLogout}
                >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                </Button>
            </div>
        </div>
    );
}
