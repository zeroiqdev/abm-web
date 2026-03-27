"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { firebaseService } from "@/services/firebaseService";
import { useAuthStore } from "@/store/authStore";
import { User, Job, Vehicle, InventoryItem } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ChevronLeft,
    Clock,
    Wrench,
    DollarSign,
    CheckCircle,
    Activity,
    FilterX,
    Calendar,
    Download,
    Package,
    ShoppingCart,
    Plus
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { cn } from "@/lib/utils";

export default function TechnicianDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user, initialized } = useAuthStore();

    const [jobs, setJobs] = useState<Job[]>([]);
    const [technician, setTechnician] = useState<User | null>(null);
    const [invoices, setInvoices] = useState<any[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [dateRange, setDateRange] = useState({
        start: format(subDays(new Date(), 30), "yyyy-MM-dd"),
        end: format(new Date(), "yyyy-MM-dd"),
    });
    const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            if (!user?.workshopId || !id) {
                if (initialized && !user) {
                    setLoading(false);
                }
                return;
            }
            try {
                const [jobsData, usersData, invoicesData, inventoryData] = await Promise.all([
                    firebaseService.getJobs(undefined, user.workshopId),
                    firebaseService.getUsersByWorkshop(user.workshopId),
                    firebaseService.getInvoices(undefined, user.workshopId),
                    firebaseService.getInventoryItems(user.workshopId)
                ]);

                const tech = usersData.find((u: any) => u.id === id);
                setTechnician(tech || null);
                setJobs(jobsData);
                setInvoices(invoicesData);
                setInventory(inventoryData);
            } catch (error) {
                console.error("Error fetching technician details:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [user, id, initialized]);

    const handleBack = () => {
        router.push("/analytics");
    };

    const filteredJobs = useMemo(() => {
        if (!id) return [];
        const start = startOfDay(new Date(dateRange.start));
        const end = endOfDay(new Date(dateRange.end));

        return jobs.filter(job => {
            const isTechAssigned = (job.assignedTechnicianIds?.includes(id as string)) || (job.assignedTechnicianId === id);
            if (!isTechAssigned) return false;

            const createdAt = job.createdAt ? new Date(job.createdAt) : new Date();
            const completedAt = job.completedAt ? new Date(job.completedAt) : null;

            const createdMatch = isWithinInterval(createdAt, { start, end });
            const completedMatch = completedAt && isWithinInterval(completedAt, { start, end });

            const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
            const paymentMatch = jobInvoices.some(inv =>
                inv.paymentHistory?.some((p: any) => {
                    const pDate = p.date ? new Date(p.date) : null;
                    return pDate && isWithinInterval(pDate, { start, end });
                })
            );

            const typeMatch = selectedJobTypes.length === 0 || selectedJobTypes.includes(job.type);

            return (createdMatch || completedMatch || paymentMatch) && typeMatch;
        });
    }, [jobs, id, dateRange, selectedJobTypes, invoices]);

    const stats = useMemo(() => {
        const start = startOfDay(new Date(dateRange.start));
        const end = endOfDay(new Date(dateRange.end));

        const completedJobs = filteredJobs.filter(j => {
            const cDate = j.completedAt ? new Date(j.completedAt) : null;
            return j.status === 'completed' && cDate && isWithinInterval(cDate, { start, end });
        });

        const totalRevenue = invoices.reduce((acc: number, inv: any) => {
            const job = jobs.find(j => j.id === inv.jobId);
            const isTechAssigned = job && ((job.assignedTechnicianIds?.includes(id as string)) || (job.assignedTechnicianId === id));
            if (!isTechAssigned) return acc;

            if (!inv.paymentHistory || !Array.isArray(inv.paymentHistory)) return acc;

            const periodPayments = inv.paymentHistory.reduce((sum: number, p: any) => {
                const pDate = p.date ? new Date(p.date) : null;
                if (pDate && isWithinInterval(pDate, { start, end })) {
                    return sum + (p.amount || 0);
                }
                return sum;
            }, 0);

            return acc + periodPayments;
        }, 0);

        return {
            completedJobsCount: completedJobs.length,
            totalRevenue,
            averageJobValue: completedJobs.length > 0 ? totalRevenue / completedJobs.length : 0,
            onTimeRate: completedJobs.length > 0 ? 100 : 0
        };
    }, [filteredJobs, invoices, id, dateRange, jobs]);

    const inventoryStats = useMemo(() => {
        const start = startOfDay(new Date(dateRange.start));
        const end = endOfDay(new Date(dateRange.end));

        // Items added by this technician
        const added = inventory.filter(item => {
            if (item.addedBy !== id) return false;
            const itemDate = item.createdAt instanceof Date ? item.createdAt : (item.createdAt as any)?.toDate ? (item.createdAt as any).toDate() : new Date(item.createdAt);
            return itemDate && isWithinInterval(itemDate, { start, end });
        });

        // Items sold (parts on invoices for jobs assigned to this tech)
        const sold: any[] = [];
        const techJobs = filteredJobs.map(j => j.id);
        
        invoices.forEach(inv => {
            if (techJobs.includes(inv.jobId)) {
                inv.items?.forEach((item: any) => {
                    const invDate = inv.createdAt instanceof Date ? inv.createdAt : (inv.createdAt as any)?.toDate ? (inv.createdAt as any).toDate() : new Date(inv.createdAt);
                    if (item.inventoryItemId && invDate && isWithinInterval(invDate, { start, end })) {
                        sold.push({
                            ...item,
                            unitPrice: item.unitPrice || item.price || 0,
                            invoiceId: inv.id,
                            invoiceNumber: inv.invoiceNumber,
                            date: invDate
                        });
                    }
                });
            }
        });

        return { added, sold };
    }, [inventory, invoices, filteredJobs, dateRange, id]);

    const downloadInventoryReport = () => {
        const csvRows = [];
        csvRows.push(["Type", "Date", "Item Name", "Quantity", "Price", "Reference"]);

        inventoryStats.added.forEach(item => {
            const itemDate = item.createdAt instanceof Date ? item.createdAt : (item.createdAt as any)?.toDate ? (item.createdAt as any).toDate() : new Date(item.createdAt);
            csvRows.push([
                "ADDED",
                itemDate ? format(itemDate, "yyyy-MM-dd") : "—",
                item.name,
                item.quantity.toString(),
                item.unitPrice.toString(),
                item.sku || "N/A"
            ]);
        });

        inventoryStats.sold.forEach(item => {
            const soldDate = item.date instanceof Date ? item.date : (item.date as any)?.toDate ? (item.date as any).toDate() : new Date(item.date);
            csvRows.push([
                "SOLD",
                soldDate ? format(soldDate, "yyyy-MM-dd") : "—",
                item.description,
                item.quantity.toString(),
                (item.unitPrice * item.quantity).toString(),
                item.invoiceNumber || item.invoiceId
            ]);
        });

        // Summary Rows
        const totalAdded = (inventoryStats.added || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
        const totalSold = (inventoryStats.sold || []).reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);

        csvRows.push([]);
        csvRows.push(["SUMMARY", "", "", "", "", ""]);
        csvRows.push(["Total Items Added", "", "", totalAdded.toString(), "", ""]);
        csvRows.push(["Total Items Used (Sold)", "", "", totalSold.toString(), "", ""]);
        csvRows.push(["Net Flow", "", "", (totalAdded - totalSold).toString(), "", ""]);

        const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        
        const startDateStr = format(startOfDay(new Date(dateRange.start)), "EEEE do MMMM, yyyy");
        const endDateStr = format(endOfDay(new Date(dateRange.end)), "EEEE do MMMM, yyyy");
        const fileName = `ABM TEK ${startDateStr} - ${endDateStr} Inventory Report.csv`;

        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-50/50">
            <Activity className="h-8 w-8 animate-spin text-blue-600" />
        </div>
    );

    if (!technician) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] space-y-4">
                <div className="p-4 bg-gray-100 rounded-2xl text-gray-400">
                    <Activity className="h-10 w-10" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Technician not found</h2>
                <Button onClick={() => router.push("/analytics")}>Back to Analytics</Button>
            </div>
        );
    }

    const formatDate = (date: any) => {
        if (!date) return "—";
        try {
            const d = date instanceof Date ? date : (date?.toDate ? date.toDate() : new Date(date));
            if (isNaN(d.getTime())) return "—";
            return format(d, "PPP");
        } catch (e) {
            return "—";
        }
    };
    return (
        <div className="p-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-6">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl h-12 w-12 bg-white shadow-sm border-none hover:bg-gray-50"
                        onClick={() => router.back()}
                    >
                        <ChevronLeft className="h-6 w-6 text-gray-900" />
                    </Button>
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16 border-4 border-white shadow-sm">
                            <AvatarFallback className="bg-gray-100 text-gray-900 font-semibold text-2xl">
                                {technician.name.charAt(0)}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">{technician.name}</h1>
                            <p className="text-gray-500 font-medium">Technician Performance Hub</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 bg-white/50 p-2 rounded-[1.5rem] backdrop-blur-sm self-start">
                    <div className="flex items-center gap-4 px-3 border-r border-gray-200">
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest pl-1">Start Date</Label>
                            <Input
                                type="date"
                                value={dateRange.start}
                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                className="h-9 w-36 border-none bg-transparent font-semibold text-gray-900 p-1 focus-visible:ring-0"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <Label className="text-[10px] font-medium text-gray-400 uppercase tracking-widest pl-1">End Date</Label>
                            <Input
                                type="date"
                                value={dateRange.end}
                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                className="h-9 w-36 border-none bg-transparent font-semibold text-gray-900 p-1 focus-visible:ring-0"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 border-none shadow-sm bg-white flex flex-col items-center justify-center text-center space-y-2">
                    <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-2">
                        <DollarSign className="h-6 w-6 text-gray-900" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Revenue Share</p>
                    <p className="text-3xl font-bold text-gray-900">₦{stats.totalRevenue.toLocaleString()}</p>
                </Card>

                <Card className="p-6 border-none shadow-sm bg-white flex flex-col items-center justify-center text-center space-y-2">
                    <div className="h-12 w-12 rounded-2xl bg-green-50 flex items-center justify-center mb-2">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Completed Jobs</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.totalJobs}</p>
                </Card>

                <Card className="p-6 border-none shadow-sm bg-white flex flex-col items-center justify-center text-center space-y-2">
                    <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center mb-2">
                        <Activity className="h-6 w-6 text-orange-600" />
                    </div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">In Progress</p>
                    <p className="text-3xl font-bold text-gray-900">{stats.activeJobs}</p>
                </Card>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-gray-400" /> Job History
                    </h2>
                    <p className="text-sm font-medium text-gray-400">{filteredJobs.length} total assignments</p>
                </div>

                <Card className="bg-white border-none shadow-sm p-0 overflow-hidden rounded-[2rem]">
                    {filteredJobs.length === 0 ? (
                        <div className="py-20 text-center">
                            <FilterX className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-medium">No results for this selection.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50/30">
                                        <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Details</th>
                                        <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Category</th>
                                        <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                        <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Revenue</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredJobs.sort((a, b) => {
                                        const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt || 0).getTime();
                                        const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt || 0).getTime();
                                        return dateB - dateA;
                                    }).map((job) => {
                                        const jobInvoices = invoices.filter(inv => inv.jobId === job.id);
                                        const techIds = job.assignedTechnicianIds || (job.assignedTechnicianId ? [job.assignedTechnicianId] : []);
                                        const start = startOfDay(new Date(dateRange.start));
                                        const end = endOfDay(new Date(dateRange.end));

                                        const revenue = jobInvoices.reduce((sum, inv) => {
                                            if (!inv.paymentHistory) return sum;
                                            return sum + inv.paymentHistory.reduce((pSum: number, p: any) => {
                                                const pDate = p.date ? (p.date instanceof Date ? p.date : new Date(p.date)) : null;
                                                if (pDate && isWithinInterval(pDate, { start, end })) {
                                                    return pSum + ((p.amount || 0) / (techIds.length || 1));
                                                }
                                                return pSum;
                                            }, 0);
                                        }, 0);

                                        return (
                                            <tr key={job.id} className="group hover:bg-gray-50/50 transition-colors">
                                                <td className="p-8">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm font-bold text-gray-900">#{job.id.slice(0, 8)}</span>
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="h-3 w-3 text-gray-300" />
                                                            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tight">
                                                                {format(job.createdAt || new Date(), "PPP")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-8">
                                                    <Badge className="bg-gray-100 text-gray-600 border-none font-semibold text-[10px] uppercase px-3 py-1">
                                                        {job.type?.replace('_', ' ') || 'REPAIR'}
                                                    </Badge>
                                                </td>
                                                <td className="p-8">
                                                    <Badge className={cn("border-none font-semibold text-[10px] uppercase px-3 py-1",
                                                        job.status === 'completed' ? "bg-green-50 text-green-700" :
                                                            job.status === 'repairing' ? "bg-blue-50 text-blue-700" :
                                                                "bg-orange-50 text-orange-700")}>
                                                        {job.status}
                                                    </Badge>
                                                </td>
                                                <td className="p-8 text-right">
                                                    <span className="text-base font-bold text-gray-900">₦{revenue.toLocaleString()}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            <div className="space-y-4 pb-12">
                <div className="flex items-center justify-between px-2">
                    <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                        <Package className="h-5 w-5 text-gray-400" /> Inventory Performance
                    </h2>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="bg-white border-none shadow-sm hover:bg-gray-50 flex items-center gap-2 rounded-xl h-9"
                        onClick={downloadInventoryReport}
                    >
                        <Download className="h-4 w-4" /> Download Inventory Report
                    </Button>
                </div>

                <Tabs defaultValue="added" className="w-full">
                    <TabsList className="bg-white/50 p-1 rounded-xl h-11 mb-4">
                        <TabsTrigger value="added" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Plus className="h-4 w-4 mr-2" /> Added Items ({inventoryStats.added.length})
                        </TabsTrigger>
                        <TabsTrigger value="sold" className="rounded-lg px-6 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <ShoppingCart className="h-4 w-4 mr-2" /> Sold Items ({inventoryStats.sold.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="added">
                        <Card className="bg-white border-none shadow-sm p-0 overflow-hidden rounded-[2rem]">
                            {inventoryStats.added.length === 0 ? (
                                <div className="py-20 text-center">
                                    <Package className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                    <p className="text-gray-400 font-medium">No items added in this timeframe.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/30">
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Name</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Qty Added</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Unit Price</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Date Added</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {inventoryStats.added.map((item) => (
                                                <tr key={item.id} className="group hover:bg-gray-50/50 transition-colors">
                                                    <td className="p-8">
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-bold text-gray-900">{item.name}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono uppercase tracking-tight">{item.sku || 'No SKU'}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-8 text-center text-sm font-medium text-gray-600">{item.quantity}</td>
                                                    <td className="p-8 text-right text-sm font-bold text-gray-900">₦{item.unitPrice.toLocaleString()}</td>
                                                     <td className="p-8 text-right text-[10px] text-gray-400 font-medium uppercase">
                                                        {formatDate(item.createdAt)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </TabsContent>

                    <TabsContent value="sold">
                        <Card className="bg-white border-none shadow-sm p-0 overflow-hidden rounded-[2rem]">
                            {inventoryStats.sold.length === 0 ? (
                                <div className="py-20 text-center">
                                    <ShoppingCart className="h-12 w-12 text-gray-200 mx-auto mb-4" />
                                    <p className="text-gray-400 font-medium">No items sold in this timeframe.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50/30">
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Item Description</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">Qty Sold</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Sold Date</th>
                                                <th className="p-8 py-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Ref Invoice</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {inventoryStats.sold.map((item, idx) => (
                                                <tr key={idx} className="group hover:bg-gray-50/50 transition-colors">
                                                    <td className="p-8 font-bold text-sm text-gray-900">{item.description}</td>
                                                    <td className="p-8 text-center text-sm font-medium text-gray-600">{item.quantity}</td>
                                                     <td className="p-8 text-right text-[10px] text-gray-400 font-medium uppercase">{formatDate(item.date)}</td>
                                                    <td className="p-8 text-right">
                                                        <span className="text-xs font-bold text-blue-600 border-b border-blue-200">
                                                            #{item.invoiceNumber || item.invoiceId.slice(-6)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
