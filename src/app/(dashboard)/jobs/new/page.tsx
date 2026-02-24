"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { firebaseService } from "@/services/firebaseService";
import { useAuthStore } from "@/store/authStore";
import { User, Vehicle, Job, Quote, InventoryItem, PartUsed } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, Loader2, Plus, Minus, Search, Trash2, Package } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const ISSUE_OPTIONS = [
    'Servicing',
    'Mechanical',
    'Electrical',
    'Hydraulic',
    'Software / Sensors',
    'Wear & Tear',
    'Accidental Damage',
    'Fluid Leak',
    'Noise / Vibration',
    'Overheating',
    'Performance Loss',
    'Tow Request',
];

export default function CreateJobPage() {
    const router = useRouter();
    const { user } = useAuthStore();
    const [customers, setCustomers] = useState<User[]>([]);
    const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
    const [description, setDescription] = useState("");
    const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
    const [serviceCharge, setServiceCharge] = useState("");
    const [technicians, setTechnicians] = useState<User[]>([]);
    const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetchingData, setFetchingData] = useState(true);

    // Parts state
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [selectedParts, setSelectedParts] = useState<(PartUsed & { maxQty: number })[]>([]);
    const [partSearch, setPartSearch] = useState("");
    const [showPartsPicker, setShowPartsPicker] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            if (!user?.workshopId) {
                setLoading(false);
                return;
            }
            try {
                const [usersData, inventoryData] = await Promise.all([
                    firebaseService.getUsersByWorkshop(user.workshopId),
                    firebaseService.getInventoryItems(user.workshopId),
                ]);
                setCustomers(usersData.filter(u => u.role === 'customer'));
                setTechnicians(usersData.filter(u => u.role === 'technician'));
                setInventoryItems(inventoryData);
            } catch (error) {
                console.error("Error fetching data:", error);
            } finally {
                setFetchingData(false);
            }
        };
        fetchData();
    }, [user]);

    useEffect(() => {
        const fetchVehicles = async () => {
            if (!selectedCustomerId) {
                setVehicles([]);
                return;
            }
            try {
                const data = await firebaseService.getVehicles(selectedCustomerId);
                setVehicles(data);
            } catch (error) {
                console.error("Error fetching vehicles:", error);
            }
        };
        fetchVehicles();
    }, [selectedCustomerId]);

    const toggleIssue = (issue: string) => {
        setSelectedIssues(prev =>
            prev.includes(issue) ? prev.filter(i => i !== issue) : [...prev, issue]
        );
    };

    // Parts helpers
    const filteredInventory = useMemo(() => {
        const alreadyAdded = new Set(selectedParts.map(p => p.partId));
        return inventoryItems
            .filter(item => item.quantity > 0) // only in-stock items
            .filter(item => !alreadyAdded.has(item.id))
            .filter(item =>
                item.name.toLowerCase().includes(partSearch.toLowerCase()) ||
                item.category?.toLowerCase().includes(partSearch.toLowerCase())
            );
    }, [inventoryItems, partSearch, selectedParts]);

    const addPart = (item: InventoryItem) => {
        setSelectedParts(prev => [
            ...prev,
            {
                partId: item.id,
                partName: item.name,
                quantity: 1,
                unitPrice: item.sellingPrice || item.unitPrice,
                maxQty: item.quantity,
            },
        ]);
        setPartSearch("");
    };

    const updatePartQty = (partId: string, delta: number) => {
        setSelectedParts(prev =>
            prev.map(p => {
                if (p.partId !== partId) return p;
                const newQty = Math.max(1, Math.min(p.maxQty, p.quantity + delta));
                return { ...p, quantity: newQty };
            })
        );
    };

    const removePart = (partId: string) => {
        setSelectedParts(prev => prev.filter(p => p.partId !== partId));
    };

    // Totals
    const labourCost = parseFloat(serviceCharge || "0");
    const partsCost = selectedParts.reduce((sum, p) => sum + p.unitPrice * p.quantity, 0);
    const estimatedTotal = labourCost + partsCost;

    const handleCreateJob = async () => {
        if (!user?.workshopId || !selectedCustomerId || !selectedVehicleId || !description || !serviceCharge) {
            toast.error("Please fill in all required fields");
            return;
        }

        setLoading(true);
        try {
            const customer = customers.find(c => c.id === selectedCustomerId);

            const partsUsed: PartUsed[] = selectedParts.map(p => ({
                partId: p.partId,
                partName: p.partName,
                quantity: p.quantity,
                unitPrice: p.unitPrice,
            }));

            // 1. Create Job
            const jobData: Omit<Job, 'id' | 'createdAt' | 'updatedAt'> = {
                userId: selectedCustomerId,
                vehicleId: selectedVehicleId,
                workshopId: user.workshopId,
                type: selectedIssues.includes('Servicing') && selectedIssues.length === 1 ? 'service' : 'repair',
                issues: selectedIssues,
                description,
                serviceCharge: labourCost,
                status: 'diagnosed',
                partsUsed: partsUsed.length > 0 ? partsUsed : undefined,
                ...(selectedTechnicianIds.length > 0 ? {
                    assignedTechnicianId: selectedTechnicianIds[0],
                    assignedTechnicianIds: selectedTechnicianIds,
                    technicianNames: selectedTechnicianIds.map(id => technicians.find(t => t.id === id)?.name || ''),
                } : {}),
            };

            const jobId = await firebaseService.createJob(jobData);

            // 2. Automatically Create Quote
            const quoteItems = [
                {
                    id: 'labour-001',
                    description: 'SERVICE LABOUR/CHARGE',
                    quantity: 1,
                    unitPrice: labourCost,
                    total: labourCost,
                    isAdditionalWork: false,
                    addedAt: new Date(),
                },
                ...selectedParts.map((p, i) => ({
                    id: `part-${i + 1}`,
                    description: p.partName,
                    quantity: p.quantity,
                    unitPrice: p.unitPrice,
                    total: p.quantity * p.unitPrice,
                    isAdditionalWork: false,
                    addedAt: new Date(),
                })),
            ];

            const quoteData: Omit<Quote, 'id' | 'createdAt' | 'updatedAt'> = {
                workshopId: user.workshopId,
                jobId: jobId,
                userId: selectedCustomerId,
                customerName: customer?.name || "Unknown",
                customerEmail: customer?.email,
                customerPhone: customer?.phone,
                items: quoteItems,
                subtotal: estimatedTotal,
                vatRate: 0,
                vat: 0,
                discount: 0,
                total: estimatedTotal,
                status: 'pending_approval',
                history: [{
                    action: 'create',
                    description: 'Quote automatically generated from Job creation',
                    userId: user.id,
                    userName: user.name,
                    timestamp: new Date()
                }]
            };

            await firebaseService.createQuote(quoteData);

            router.push(`/jobs`);
        } catch (error) {
            console.error("Error creating job and quote:", error);
            toast.error("Failed to create job");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20 pt-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <h2 className="text-3xl font-bold tracking-tight">New Job Request</h2>
            </div>

            <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2 space-y-6">
                    <Card className="shadow-sm border-none bg-white">
                        <CardHeader>
                            <CardTitle className="text-lg">Job Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <Label>Select Issues</Label>
                                <div className="flex flex-wrap gap-2">
                                    {ISSUE_OPTIONS.map(issue => (
                                        <Badge
                                            key={issue}
                                            variant={selectedIssues.includes(issue) ? "default" : "outline"}
                                            className="cursor-pointer px-3 py-1 text-sm font-medium transition-colors"
                                            onClick={() => toggleIssue(issue)}
                                        >
                                            {issue}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Detailed Description</Label>
                                <Textarea
                                    id="description"
                                    placeholder="Enter detailed description of the work needed..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="min-h-[120px] bg-gray-50/50 border-gray-200"
                                />
                            </div>

                            <Separator />

                            <div className="space-y-2">
                                <Label htmlFor="serviceCharge">Service Charge (Labour Cost)</Label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-gray-400 font-medium">₦</span>
                                    <Input
                                        id="serviceCharge"
                                        type="number"
                                        placeholder="0.00"
                                        value={serviceCharge}
                                        onChange={(e) => setServiceCharge(e.target.value)}
                                        className="pl-8 bg-gray-50/50 border-gray-200"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Parts Card */}
                    <Card className="shadow-sm border-none bg-white">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Package className="h-5 w-5" /> Parts
                            </CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowPartsPicker(!showPartsPicker)}
                            >
                                <Plus className="mr-1 h-4 w-4" /> Add Part
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Parts Picker */}
                            {showPartsPicker && (
                                <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                                        <Input
                                            placeholder="Search inventory..."
                                            className="pl-9 bg-white"
                                            value={partSearch}
                                            onChange={(e) => setPartSearch(e.target.value)}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-1">
                                        {filteredInventory.length === 0 ? (
                                            <p className="text-sm text-gray-500 text-center py-4">
                                                {partSearch ? "No matching items" : "No available inventory items"}
                                            </p>
                                        ) : (
                                            filteredInventory.map(item => (
                                                <button
                                                    key={item.id}
                                                    className="w-full flex items-center justify-between p-2 rounded-md hover:bg-white transition-colors text-left"
                                                    onClick={() => addPart(item)}
                                                >
                                                    <div>
                                                        <p className="text-sm font-medium">{item.name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            {item.category} · {item.quantity} in stock
                                                        </p>
                                                    </div>
                                                    <span className="text-sm font-semibold">
                                                        ₦{(item.sellingPrice || item.unitPrice).toLocaleString()}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Selected Parts List */}
                            {selectedParts.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-4">
                                    No parts added yet. Click &quot;Add Part&quot; to select from inventory.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {selectedParts.map(part => (
                                        <div
                                            key={part.partId}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-sm truncate">{part.partName}</p>
                                                <p className="text-xs text-gray-500">
                                                    ₦{part.unitPrice.toLocaleString()} each
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 ml-4">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => updatePartQty(part.partId, -1)}
                                                    disabled={part.quantity <= 1}
                                                >
                                                    <Minus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-6 text-center font-semibold text-sm">
                                                    {part.quantity}
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => updatePartQty(part.partId, 1)}
                                                    disabled={part.quantity >= part.maxQty}
                                                >
                                                    <Plus className="h-3 w-3" />
                                                </Button>
                                                <span className="w-20 text-right font-semibold text-sm">
                                                    ₦{(part.unitPrice * part.quantity).toLocaleString()}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 ml-1"
                                                    onClick={() => removePart(part.partId)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="flex justify-between pt-2 text-sm font-semibold">
                                        <span>Parts Total</span>
                                        <span>₦{partsCost.toLocaleString()}</span>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card className="shadow-sm border-none bg-white">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-lg">Customer & Vehicle</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label>Customer</Label>
                                <Select onValueChange={setSelectedCustomerId} value={selectedCustomerId}>
                                    <SelectTrigger className="bg-gray-50/50 border-gray-200">
                                        <SelectValue placeholder="Select customer..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {customers.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Vehicle</Label>
                                <Select
                                    onValueChange={setSelectedVehicleId}
                                    value={selectedVehicleId}
                                    disabled={!selectedCustomerId}
                                >
                                    <SelectTrigger className="bg-gray-50/50 border-gray-200">
                                        <SelectValue placeholder={selectedCustomerId ? "Select vehicle..." : "Select customer first"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {vehicles.map(v => (
                                            <SelectItem key={v.id} value={v.id}>
                                                {v.make} {v.model} ({v.licensePlate})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {selectedCustomerId && vehicles.length === 0 && (
                                    <p className="text-xs text-orange-600 mt-1">This customer has no vehicles registered.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Technician Assignment */}
                    <Card className="shadow-sm border-none bg-white">
                        <CardHeader>
                            <CardTitle className="text-lg">Assign Team</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Label>Technicians</Label>
                            <div className="flex flex-wrap gap-2">
                                {technicians.map(t => (
                                    <Badge
                                        key={t.id}
                                        variant={selectedTechnicianIds.includes(t.id) ? "default" : "outline"}
                                        className="cursor-pointer px-3 py-1 text-sm font-medium transition-colors"
                                        onClick={() => {
                                            setSelectedTechnicianIds(prev =>
                                                prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                            );
                                        }}
                                    >
                                        {t.name}
                                    </Badge>
                                ))}
                            </div>
                            {technicians.length === 0 && (
                                <p className="text-xs text-orange-600 mt-1">No technicians registered in this workshop.</p>
                            )}
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                {selectedTechnicianIds.length} technician(s) selected
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm border-none bg-black text-white">
                        <CardHeader>
                            <CardTitle className="text-lg text-white">Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-400">Labour Charge</span>
                                <span className="font-bold">₦{labourCost.toLocaleString()}</span>
                            </div>
                            {selectedParts.length > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-400">Parts ({selectedParts.length})</span>
                                    <span className="font-bold">₦{partsCost.toLocaleString()}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center text-sm pt-2">
                                <span className="text-gray-400">Estimated Total</span>
                                <span className="text-xl font-bold">₦{estimatedTotal.toLocaleString()}</span>
                            </div>
                            <Separator className="bg-gray-700" />
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Automatic Action</p>
                            <p className="text-xs text-gray-300 leading-relaxed italic">
                                Saving this job will automatically generate a quote with wait for approval status.
                            </p>
                        </CardContent>
                        <CardFooter>
                            <Button
                                className="w-full bg-white text-black hover:bg-gray-200 font-bold"
                                onClick={handleCreateJob}
                                disabled={loading}
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Generate Quote
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            </div>
        </div>
    );
}
