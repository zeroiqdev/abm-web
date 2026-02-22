"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { PageLoader } from "@/components/ui/page-loader";

export default function RootPage() {
    const router = useRouter();
    const { user, loading } = useAuthStore();

    useEffect(() => {
        if (!loading) {
            if (user) {
                router.push("/"); // Dashboard Overview
            } else {
                router.push("/login");
            }
        }
    }, [user, loading, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <PageLoader message="Initializing ABM Workshop..." />
        </div>
    );
}
