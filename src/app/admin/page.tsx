"use client";

import { PageLoader } from "@/components/ui/page-loader";

export default function RootPage() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-white">
            <PageLoader message="Initializing Dashboard..." />
        </div>
    );
}
