"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { firebaseService } from "@/services/firebaseService";
import { useAuthStore } from "@/store/authStore";
import { User, Vehicle, Job, Invoice, Quote, JobStatus } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
    ChevronLeft,
    Clock,
    Wrench,
    DollarSign,
    CheckCircle,
    Activity,
    Calendar,
    User as UserIcon,
    Car,
    FileText,
    AlertCircle,
    History,
    Loader2
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/ui/dialog";

export default function JobDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user: currentUser } = useAuthStore();

    const [job, setJob] = useState<Job | null>(null);
    const [customer, setCustomer] = useState<User | null>(null);
    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [technician, setTechnician] = useState<User | null>(null); // Primary for legacy/display
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [loading, setLoading] = useState(true);
    const [isStatusOpen, setIsStatusOpen] = useState(false);
    const [updatingStatus, setUpdatingStatus] = useState(false);

    useEffect(() => {
        const fetchJobData = async () => {
            if (!currentUser?.workshopId || !id) return;
            try {
                const jobData = await firebaseService.getJob(id as string);
                if (jobData) {
                    setJob(jobData);

                    // Parallel fetch related info
                    const [custData, vehData, invData, quoteData] = await Promise.all([
                        firebaseService.getUser(jobData.userId),
                        firebaseService.getVehicles(jobData.userId).then(list => list.find(v => v.id === jobData.vehicleId)),
                        firebaseService.getInvoices(undefined, currentUser.workshopId).then(list => list.filter(inv => inv.jobId === id)),
                        firebaseService.getQuotes(currentUser.workshopId).then(list => list.filter(q => q.jobId === id))
                    ]);

                    setCustomer(custData);
                    setVehicle(vehData || null);
                    setInvoices(invData);
                    setQuotes(quoteData);

                    if (jobData.assignedTechnicianId) {
                        const techData = await firebaseService.getUser(jobData.assignedTechnicianId);
                        setTechnician(techData);
                    }
                }
            } catch (error) {
                console.error("Error fetching job details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchJobData();
    }, [currentUser, id]);

    const getStatusVariant = (status: JobStatus) => {
        switch (status) {
            case "completed": return "bg-green-50 text-green-700 border-green-100";
            case "repairing": return "bg-blue-50 text-blue-700 border-blue-100";
            case "diagnosed": return "bg-orange-50 text-orange-700 border-orange-100";
            case "received": return "bg-gray-50 text-gray-700 border-gray-100";
            case "cancelled": return "bg-gray-100 text-gray-400 border-gray-200 line-through";
            default: return "bg-gray-50 text-gray-600";
        }
    };

    const allStatuses: JobStatus[] = ['received', 'diagnosed', 'repairing', 'completed', 'cancelled'];

    const statusLabels: Record<JobStatus, string> = {
        received: 'Received',
        diagnosed: 'Diagnosed',
        repairing: 'Repairing',
        completed: 'Completed',
        cancelled: 'Cancelled',
    };

    const handleStatusUpdate = async (newStatus: JobStatus) => {
        if (!job || !currentUser || newStatus === job.status) return;

        setUpdatingStatus(true);
        try {
            const historyEntry = {
                fromStatus: job.status,
                toStatus: newStatus,
                changedAt: new Date(),
                changedByName: currentUser.name || currentUser.email || 'Staff',
                changedBy: currentUser.id,
            };

            const updateData: Record<string, unknown> = {
                status: newStatus,
                statusHistory: [...(job.statusHistory || []), historyEntry],
            };

            if (newStatus === 'completed') {
                updateData.completedAt = new Date();
            }

            await firebaseService.updateJob(job.id, updateData as Partial<Job>);

            // Update local state
            setJob({
                ...job,
                status: newStatus,
                statusHistory: [...(job.statusHistory || []), historyEntry],
                ...(newStatus === 'completed' ? { completedAt: new Date() } : {}),
            });

            setIsStatusOpen(false);
        } catch (error) {
            console.error('Error updating job status:', error);
            toast.error('Failed to update job status.');
        } finally {
            setUpdatingStatus(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    if (!job) {
        return (
            <div className="p-8 text-center">
                <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-gray-900">Job Record Not Found</h3>
                <p className="text-gray-500 mt-1">The job request you are looking for might have been removed.</p>
                <Button variant="ghost" className="mt-6 font-semibold" onClick={() => router.push("/admin/jobs")}>
                    <ChevronLeft className="h-4 w-4 mr-2" /> Back to Job List
                </Button>
            </div>
        );
    }

    const totalCost = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl h-12 w-12 bg-white shadow-sm border border-gray-100 hover:bg-gray-50"
                        onClick={() => router.push("/admin/jobs")}
                    >
                        <ChevronLeft className="h-6 w-6 text-gray-900" />
                    </Button>
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-black tracking-tight text-gray-900 capitalize">
                                {job.type.replace('_', ' ')} Application
                            </h1>
                            <Badge className={cn("border px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg", getStatusVariant(job.status))}>
                                {job.status}
                            </Badge>
                        </div>
                        <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                            Job ID: <span className="text-gray-900 font-mono tracking-normal ml-1">#{job.id.slice(0, 12).toUpperCase()}</span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Button variant="outline" className="rounded-xl font-bold border-gray-200">
                        Print Job Card
                    </Button>
                    <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
                        <DialogTrigger asChild>
                            <Button className="rounded-xl bg-gray-900 hover:bg-black font-bold shadow-md">
                                Update Status
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm rounded-3xl border-none shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-black">Update Job Status</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-2 py-4">
                                {allStatuses.map((status) => (
                                    <button
                                        key={status}
                                        disabled={updatingStatus || status === job.status}
                                        onClick={() => handleStatusUpdate(status)}
                                        className={cn(
                                            "w-full flex items-center justify-between p-4 rounded-2xl text-left transition-all font-bold text-sm",
                                            status === job.status
                                                ? "bg-gray-900 text-white cursor-default"
                                                : "bg-gray-50 hover:bg-gray-100 text-gray-900 cursor-pointer"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "h-3 w-3 rounded-full",
                                                status === 'received' && "bg-gray-400",
                                                status === 'diagnosed' && "bg-orange-400",
                                                status === 'repairing' && "bg-blue-400",
                                                status === 'completed' && "bg-green-400",
                                                status === 'cancelled' && "bg-red-400",
                                            )} />
                                            <span>{statusLabels[status]}</span>
                                        </div>
                                        {status === job.status && (
                                            <Badge className="bg-white/20 text-white border-none text-[8px] uppercase">Current</Badge>
                                        )}
                                    </button>
                                ))}
                            </div>
                            {updatingStatus && (
                                <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Updating status...
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Core Info */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Customer & Vehicle Info */}
                    <Card className="border-none shadow-sm bg-white overflow-hidden rounded-[2.5rem]">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-50 px-10 py-8">
                            <CardTitle className="text-sm font-black text-gray-400 uppercase tracking-widest">Client & Vehicle Details</CardTitle>
                        </CardHeader>
                        <CardContent className="p-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Customer</p>
                                        <p className="text-lg font-bold text-gray-900">{customer?.name || "Direct Customer"}</p>
                                        <p className="text-sm text-gray-500 font-medium">{customer?.phone || "No phone provided"}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Issue Reported</p>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {job.issues && job.issues.length > 0 ? (
                                                job.issues.map((iss, idx) => (
                                                    <Badge key={idx} variant="outline" className="bg-gray-50/50 border-gray-100 text-gray-600 font-bold text-[10px] uppercase">
                                                        {iss}
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-sm text-gray-400 italic">No specific issues selected</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Assigned Vehicle</p>
                                        {vehicle ? (
                                            <>
                                                <p className="text-lg font-bold text-gray-900">{vehicle.make} {vehicle.model}</p>
                                                <p className="text-sm text-gray-500 font-medium uppercase tracking-widest">Plate: {vehicle.licensePlate}</p>
                                                <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold">VIN: {vehicle.vin}</p>
                                            </>
                                        ) : (
                                            <p className="text-sm text-gray-400">Loading vehicle info...</p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Job Timeline</p>
                                        <p className="text-sm font-bold text-gray-900">Received: {format(job.createdAt || new Date(), "PPP")}</p>
                                        {job.completedAt && (
                                            <p className="text-sm font-bold text-green-600 mt-1">Completed: {format(job.completedAt, "PPP")}</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <Separator className="my-10" />

                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Detailed Technician Notes</p>
                                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 italic text-gray-600 leading-relaxed">
                                    {job.description || "No detailed description provided for this job request."}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Job History / Timeline */}
                    <Card className="border-none shadow-sm bg-white overflow-hidden rounded-[2.5rem]">
                        <CardHeader className="bg-gray-50/50 border-b border-gray-50 px-10 py-8">
                            <CardTitle className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-3">
                                <History className="h-4 w-4" /> Activity Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-10">
                            <div className="space-y-8">
                                {job.statusHistory && job.statusHistory.length > 0 ? (
                                    job.statusHistory.map((entry, idx) => (
                                        <div key={idx} className="flex gap-6 relative">
                                            {idx !== job.statusHistory!.length - 1 && (
                                                <div className="absolute left-5 top-10 bottom-[-32px] w-px bg-gray-100" />
                                            )}
                                            <div className="h-10 w-10 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center z-10">
                                                <div className="h-2 w-2 rounded-full bg-gray-400" />
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-bold text-gray-900">
                                                        Status changed from <span className="text-gray-400 line-through mx-1">{entry.fromStatus}</span> to <span className="text-blue-600">{entry.toStatus}</span>
                                                    </p>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase">{format(entry.changedAt || new Date(), "MMM d, HH:mm")}</span>
                                                </div>
                                                <p className="text-xs text-gray-500 font-medium mt-1">Processed by {entry.changedByName || "System"}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center py-10 text-gray-400 italic text-sm">
                                        No status history available for this job.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Financials & Technicians */}
                <div className="space-y-8">
                    {/* Financial Summary */}
                    <Card className="border-none shadow-lg bg-gray-900 text-white rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-10 pb-4">
                            <CardTitle className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Financial Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="p-10 pt-0 space-y-8">
                            <div>
                                <h3 className="text-4xl font-black tracking-tighter">₦{totalCost.toLocaleString()}</h3>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Total Cost</p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Paid</p>
                                    <p className="text-lg font-black text-green-400">₦{totalPaid.toLocaleString()}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Balance</p>
                                    <p className="text-lg font-black text-orange-400">₦{(totalCost - totalPaid).toLocaleString()}</p>
                                </div>
                            </div>

                            <Separator className="bg-white/10" />

                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Linked Documents</p>
                                {quotes.length > 0 && (
                                    <div className="space-y-3">
                                        {quotes.map(q => (
                                            <Button
                                                key={q.id}
                                                variant="secondary"
                                                className="w-full justify-between bg-white text-gray-900 hover:bg-gray-50 rounded-xl"
                                                onClick={() => router.push(`/finance/quotes/${q.id}`)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <FileText className="h-4 w-4 text-blue-500" />
                                                    <span className="font-bold">Quote #{q.id.slice(-6).toUpperCase()}</span>
                                                </div>
                                                <Badge className="bg-gray-100 text-gray-600 border-none text-[8px] uppercase">{q.status}</Badge>
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                {invoices.length > 0 && (
                                    <div className="space-y-3">
                                        {invoices.map(inv => (
                                            <Button
                                                key={inv.id}
                                                variant="secondary"
                                                className="w-full justify-between bg-white text-gray-900 hover:bg-gray-50 rounded-xl"
                                                onClick={() => router.push(`/finance/invoices/${inv.id}`)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <DollarSign className="h-4 w-4 text-green-500" />
                                                    <span className="font-bold">Invoice #{inv.id.slice(-6).toUpperCase()}</span>
                                                </div>
                                                <Badge className="bg-gray-100 text-gray-600 border-none text-[8px] uppercase">{inv.paymentStatus}</Badge>
                                            </Button>
                                        ))}
                                    </div>
                                )}
                                {quotes.length === 0 && invoices.length === 0 && (
                                    <p className="text-xs text-gray-500 italic">No financial documents linked.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Team Assigned */}
                    <Card className="border-none shadow-sm bg-white rounded-[2.5rem] overflow-hidden">
                        <CardHeader className="p-8 pb-4">
                            <CardTitle className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Personnel Assigned</CardTitle>
                        </CardHeader>
                        <CardContent className="p-8 pt-0 space-y-6">
                            <div className="space-y-4">
                                {(job.assignedTechnicianIds?.length || 0) > 0 ? (
                                    job.assignedTechnicianIds!.map((techId, idx) => (
                                        <div key={techId} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="h-10 w-10 shadow-sm border border-white">
                                                    <AvatarFallback className="bg-gray-900 text-white font-black text-xs">
                                                        {job.technicianNames?.[idx]?.charAt(0) || "T"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <p className="text-sm font-bold text-gray-900">{job.technicianNames?.[idx] || 'Assigned Staff'}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Expert Technician</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : job.assignedTechnicianId ? (
                                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-10 w-10 shadow-sm border border-white">
                                                <AvatarFallback className="bg-gray-900 text-white font-black text-xs">
                                                    {technician?.name?.charAt(0) || "T"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{technician?.name || 'Assigned Staff'}</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Technician</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-6">
                                        <div className="h-12 w-12 rounded-full bg-orange-50 flex items-center justify-center mx-auto mb-3">
                                            <AlertCircle className="h-6 w-6 text-orange-400" />
                                        </div>
                                        <p className="text-sm font-bold text-gray-900">Unassigned</p>
                                        <p className="text-xs text-gray-500 mt-1">Ready for staff allocation.</p>
                                    </div>
                                )}
                            </div>
                            <Button className="w-full rounded-xl bg-gray-100 text-gray-900 hover:bg-gray-200 font-bold border-none shadow-none">
                                Manage Team
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
