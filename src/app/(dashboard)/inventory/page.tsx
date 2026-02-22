"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "@/store/authStore";
import { firebaseService } from "@/services/firebaseService";
import { InventoryItem } from "@/types";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Search, Plus, Minus, Inbox, Loader2, ArrowLeft, Check, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function InventoryPage() {
    const { user } = useAuthStore();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);

    // Dialog state
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state — matching mobile app
    const [formVendor, setFormVendor] = useState("");
    const [formName, setFormName] = useState("");
    const [formSku, setFormSku] = useState("");
    const [formCostPrice, setFormCostPrice] = useState("");
    const [formSellingPrice, setFormSellingPrice] = useState("");

    // Unit IDs (serial numbers) - matching mobile app
    const [existingUnitIds, setExistingUnitIds] = useState<string[]>([]);
    const [newUnitIds, setNewUnitIds] = useState<string[]>([]);

    const totalQuantity = existingUnitIds.length + newUnitIds.length;

    useEffect(() => {
        const fetchInventory = async () => {
            if (!user?.workshopId) {
                setLoading(false);
                return;
            }
            try {
                const data = await firebaseService.getInventoryItems(user.workshopId);
                setItems(data);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchInventory();
    }, [user]);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.vendor || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.sku || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    const resetForm = () => {
        setFormVendor("");
        setFormName("");
        setFormSku("");
        setFormCostPrice("");
        setFormSellingPrice("");
        setExistingUnitIds([]);
        setNewUnitIds([]);
        setEditingItem(null);
    };

    const openAddDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const openEditDialog = (item: InventoryItem) => {
        setEditingItem(item);
        setFormName(item.name);
        setFormSku(item.sku || "");
        setFormVendor(item.vendor || (item as any).supplier || "");
        setFormCostPrice(item.costPrice?.toString() || "");
        setFormSellingPrice(item.sellingPrice?.toString() || item.unitPrice?.toString() || "");
        setExistingUnitIds(item.unitIds || []);
        setNewUnitIds([]);
        setIsDialogOpen(true);
    };

    const handleNewQuantityChange = (delta: number) => {
        if (delta > 0) {
            setNewUnitIds(prev => [...prev, ...Array(delta).fill("")]);
        } else {
            const slotsToRemove = Math.abs(delta);
            setNewUnitIds(prev => prev.slice(0, Math.max(0, prev.length - slotsToRemove)));
        }
    };

    const updateNewUnitId = (index: number, value: string) => {
        setNewUnitIds(prev => {
            const updated = [...prev];
            updated[index] = value;
            return updated;
        });
    };

    const handleSave = async () => {
        if (!formName.trim() || !formVendor.trim()) {
            toast.error("Please fill in Vendor Name and Item Name.");
            return;
        }
        if (!user?.workshopId) return;

        // Validate new unit IDs — no empty slots
        const emptyNewSlots = newUnitIds.some(id => id.trim() === "");
        if (emptyNewSlots) {
            toast.error("Please enter a Unique ID for all new units or remove empty slots using the - button.");
            return;
        }

        // Check for duplicates within new batch
        const newIdsSet = new Set(newUnitIds.map(id => id.trim().toLowerCase()));
        if (newIdsSet.size !== newUnitIds.length) {
            toast.error("You have entered duplicate IDs in the new units list.");
            return;
        }

        // Check for duplicates against existing IDs of this item
        const existingIdsSet = new Set(existingUnitIds.map(id => id.trim().toLowerCase()));
        const duplicatesInExisting = newUnitIds.filter(id => existingIdsSet.has(id.trim().toLowerCase()));
        if (duplicatesInExisting.length > 0) {
            toast.error(`The following IDs already exist in this item: ${duplicatesInExisting.join(", ")}`);
            return;
        }

        setSaving(true);

        try {
            // Global uniqueness check
            const allItems = await firebaseService.getInventoryItems(user.workshopId);
            const allOtherUniqueIds = new Set<string>();

            allItems.forEach(item => {
                if (item.id === editingItem?.id) return;
                if (item.unitIds) {
                    item.unitIds.forEach(uid => {
                        if (uid && uid.trim() !== "") {
                            allOtherUniqueIds.add(uid.trim().toLowerCase());
                        }
                    });
                }
            });

            const globalDuplicates: string[] = [];
            newUnitIds.forEach(newId => {
                if (allOtherUniqueIds.has(newId.trim().toLowerCase())) {
                    globalDuplicates.push(newId.trim());
                }
            });

            if (globalDuplicates.length > 0) {
                setSaving(false);
                toast.error(`The following unique ID(s) already exist in other inventory items: ${globalDuplicates.join(", ")}. Each unique ID must be unique across all inventory items.`);
                return;
            }

            // Check for duplicate item names
            const isNameDuplicate = allItems.some(
                (item) => item.name.toLowerCase() === formName.trim().toLowerCase() && item.id !== editingItem?.id
            );

            if (isNameDuplicate) {
                setSaving(false);
                toast.error("An item with this name already exists. Please edit the existing item to update its stock level.");
                return;
            }

            // Prepare final data — matching mobile app exactly
            const finalUnitIds = [...existingUnitIds, ...newUnitIds.map(id => id.trim())];
            const finalQuantity = finalUnitIds.length;

            const itemData: any = {
                workshopId: user.workshopId,
                name: formName.trim(),
                category: "General",
                quantity: finalQuantity,
                minStockLevel: 5,
                sku: formSku.trim(),
                vendor: formVendor.trim(),
                costPrice: parseFloat(formCostPrice) || 0,
                sellingPrice: parseFloat(formSellingPrice) || 0,
                unitPrice: parseFloat(formSellingPrice) || 0,
                unitIds: finalUnitIds,
            };

            if (editingItem) {
                await firebaseService.updateInventoryItem(editingItem.id, itemData);
                setItems(items.map(i => i.id === editingItem.id ? { ...i, ...itemData } : i));
            } else {
                const newId = await firebaseService.createInventoryItem(itemData);
                setItems([...items, { id: newId, ...itemData, createdAt: new Date(), updatedAt: new Date() } as InventoryItem]);
            }

            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving inventory item:", error);
            toast.error("Failed to save item.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 pt-8">
            <div className="flex items-center justify-between px-8">
                <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
                <Button onClick={openAddDialog}>
                    <Plus className="mr-2 h-4 w-4" /> Add Item
                </Button>
            </div>

            <div className="flex items-center space-x-2 px-8">
                <div className="relative w-full max-w-sm">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search parts..."
                        className="pl-8"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="border-y bg-white w-full">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-gray-50/50">
                            <TableHead className="pl-8">Part Name</TableHead>
                            <TableHead>Vendor</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">Stock</TableHead>
                            <TableHead className="text-right">Selling Price</TableHead>
                            <TableHead className="text-right pr-8">Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-24 text-center">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        ) : filteredItems.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="h-48 text-center">
                                    <div className="flex flex-col items-center justify-center space-y-3">
                                        <div className="p-4 bg-gray-100 rounded-2xl text-gray-400">
                                            <Inbox className="h-10 w-10 stroke-[1.5]" />
                                        </div>
                                        <p className="text-gray-900 font-semibold">No items found.</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredItems.map((item) => (
                                <TableRow
                                    key={item.id}
                                    className="cursor-pointer hover:bg-gray-50/50 transition-colors"
                                    onClick={() => openEditDialog(item)}
                                >
                                    <TableCell className="font-medium pl-8">{item.name}</TableCell>
                                    <TableCell className="text-gray-500">{item.vendor || "—"}</TableCell>
                                    <TableCell className="text-gray-500 font-mono text-xs">{item.sku || "—"}</TableCell>
                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                    <TableCell className="text-right">₦{(item.sellingPrice || item.unitPrice || 0).toLocaleString()}</TableCell>
                                    <TableCell className="text-right pr-8">
                                        {item.quantity <= (item.minStockLevel || 5) ? (
                                            <Badge variant="destructive">Low Stock</Badge>
                                        ) : (
                                            <Badge variant="secondary">In Stock</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )))}
                    </TableBody>
                </Table>
            </div>

            {/* Add / Edit Dialog — Matching Mobile App */}
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">{editingItem ? "Edit Item" : "New Item"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        {/* Vendor Name */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-600">Vendor Name *</Label>
                            <Input
                                placeholder="Enter vendor name"
                                value={formVendor}
                                onChange={(e) => setFormVendor(e.target.value)}
                            />
                        </div>

                        {/* Item Name */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-600">Item Name *</Label>
                            <Input
                                placeholder="Enter the item name"
                                value={formName}
                                onChange={(e) => setFormName(e.target.value)}
                            />
                        </div>

                        {/* SKU */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold text-gray-600">SKU</Label>
                            <Input
                                placeholder="Enter SKU"
                                value={formSku}
                                onChange={(e) => setFormSku(e.target.value)}
                            />
                        </div>

                        <Separator />

                        {/* Stock Management */}
                        <div className="space-y-4">
                            <Label className="text-sm font-semibold text-gray-600">Stock Management</Label>

                            {/* Summary Card */}
                            <div className="grid grid-cols-3 gap-0 bg-gray-50 rounded-xl overflow-hidden border border-gray-100">
                                <div className="text-center py-4 px-2">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Current Stock</p>
                                    <p className="text-xl font-bold text-gray-900">{existingUnitIds.length}</p>
                                </div>
                                <div className="text-center py-4 px-2 border-x border-gray-100">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Adding</p>
                                    <p className="text-xl font-bold text-gray-900">+{newUnitIds.length}</p>
                                </div>
                                <div className="text-center py-4 px-2">
                                    <p className="text-xs text-gray-400 font-medium mb-1">Total</p>
                                    <p className="text-xl font-bold text-gray-900">{totalQuantity}</p>
                                </div>
                            </div>

                            {/* Add New Units Stepper */}
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-gray-700">Add New Units</p>
                                <div className="flex items-center gap-4">
                                    <button
                                        type="button"
                                        onClick={() => handleNewQuantityChange(-1)}
                                        disabled={newUnitIds.length === 0}
                                        className={cn(
                                            "h-10 w-10 rounded-xl border-2 flex items-center justify-center transition-all",
                                            newUnitIds.length === 0
                                                ? "border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed"
                                                : "border-gray-900 text-gray-900 bg-white hover:bg-gray-50 cursor-pointer"
                                        )}
                                    >
                                        <Minus className="h-4 w-4" />
                                    </button>
                                    <span className="text-2xl font-bold text-gray-900 min-w-[40px] text-center">
                                        {newUnitIds.length}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => handleNewQuantityChange(1)}
                                        className="h-10 w-10 rounded-xl border-2 border-gray-900 text-gray-900 bg-white hover:bg-gray-50 flex items-center justify-center transition-all cursor-pointer"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            {/* New Unit ID Inputs */}
                            {newUnitIds.length > 0 && (
                                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                                    <p className="text-xs text-gray-500">Enter Unique ID (Serial Number) for each new unit</p>
                                    {newUnitIds.map((uid, index) => {
                                        const isFilled = uid.trim() !== "";
                                        return (
                                            <Input
                                                key={index}
                                                placeholder={`New Unit ${index + 1} ID`}
                                                value={uid}
                                                onChange={(e) => updateNewUnitId(index, e.target.value)}
                                                className={cn(
                                                    "bg-white",
                                                    isFilled && "border-green-400 bg-green-50/50"
                                                )}
                                            />
                                        );
                                    })}
                                </div>
                            )}

                            {/* Existing Unit IDs */}
                            {existingUnitIds.length > 0 && (
                                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                                    <p className="text-xs font-semibold text-gray-500">Existing Units ({existingUnitIds.length})</p>
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        {existingUnitIds.join(", ")}
                                    </p>
                                </div>
                            )}
                        </div>

                        <Separator />

                        {/* Pricing */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-600">Cost Price (₦)</Label>
                                <Input
                                    type="number"
                                    placeholder="Amount"
                                    value={formCostPrice}
                                    onChange={(e) => setFormCostPrice(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold text-gray-600">Selling Price (₦)</Label>
                                <Input
                                    type="number"
                                    placeholder="Amount"
                                    value={formSellingPrice}
                                    onChange={(e) => setFormSellingPrice(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Item
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
