"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { firebaseService } from "@/services/firebaseService";
import { useAuthStore } from "@/store/authStore";
import { Invoice, InvoiceItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Printer, CheckCircle, ArrowLeft, Pencil, Plus, Upload, FileText, CreditCard, Banknote, Building2, Loader2, Eye, XCircle, Clock } from "lucide-react";
import Link from "next/link";
import { cn, numberToWords } from "@/lib/utils";
import { PageLoader } from "@/components/ui/page-loader";
import { toast } from "sonner";
import { uploadToCloudinary } from "@/services/cloudinaryService";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

const PAYMENT_METHODS = [
    { value: "cash", label: "Cash", icon: Banknote },
    { value: "bank_transfer", label: "Bank Transfer", icon: Building2 },
    { value: "bank_card", label: "Bank Card", icon: CreditCard },
];

export default function InvoiceDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user } = useAuthStore();
    const [invoice, setInvoice] = useState<Invoice | null>(null);
    const [vehicle, setVehicle] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showApproveModal, setShowApproveModal] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<number>(0);
    const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
    const [receiptFile, setReceiptFile] = useState<File | null>(null);
    const [isRecordingPayment, setIsRecordingPayment] = useState(false);
    const receiptInputRef = useRef<HTMLInputElement>(null);

    const [showAddItem, setShowAddItem] = useState(false);
    const [newDescription, setNewDescription] = useState("");
    const [newQuantity, setNewQuantity] = useState("1");
    const [newPrice, setNewPrice] = useState("");
    const [isAddingItem, setIsAddingItem] = useState(false);

    const [uploadingReceiptIdx, setUploadingReceiptIdx] = useState<number | null>(null);
    const historyReceiptRef = useRef<HTMLInputElement>(null);

    const [confirmingPendingPayment, setConfirmingPendingPayment] = useState<any>(null);
    const [confirmAmount, setConfirmAmount] = useState<number>(0);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);

    useEffect(() => {
        const fetchInvoice = async () => {
            if (typeof id !== "string") return;
            try {
                const data = await firebaseService.getInvoice(id);
                if (!data) return;
                setInvoice(data);
                
                // Fetch vehicle details if jobId exists
                const jobId = data.jobId;
                if (jobId) {
                    const job = await firebaseService.getJob(jobId);
                    if (job && job.vehicleId) {
                        const vehicleData = await firebaseService.getVehicle(job.vehicleId);
                        setVehicle(vehicleData);
                    }
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchInvoice();
    }, [id]);

    const getStatusStyles = (status: string, invoiceStatus?: string) => {
        const s = status?.toLowerCase();
        const is = invoiceStatus?.toLowerCase();

        if (s === 'approved' || s === 'settled' || is === 'settled')
            return "bg-[#34C759]/20 text-[#34C759] border-[#34C759]/40";
        if (s === 'pending' || s === 'pending_approval' || is === 'pending_approval')
            return "bg-[#FF9500]/20 text-[#FF9500] border-[#FF9500]/40";
        if (s === 'void' || s === 'rejected' || s === 'cancelled' || is === 'void')
            return "bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/40";
        if (s === 'draft')
            return "bg-[#999999]/20 text-[#999999] border-[#999999]/40";

        return "bg-gray-100 text-gray-800 border-gray-200";
    };

    if (loading) return <PageLoader message="Loading invoice..." />;
    if (!invoice) return <div>Invoice not found</div>;

    const handlePrint = () => {
        const oldTitle = document.title;
        document.title = invoice.invoiceNumber || invoice.id;
        window.print();
        document.title = oldTitle;
    };

    const handleApprove = async () => {
        if (!invoice || !user) return;
        try {
            const isOverride = invoice.status !== "draft";
            await firebaseService.approveInvoice(invoice.id, user.id, undefined, isOverride);
            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            setShowApproveModal(false);
            toast.success(isOverride ? "Invoice approved offline" : "Invoice approved");
        } catch (error) {
            console.error("Error approving invoice:", error);
            toast.error("Failed to approve invoice");
        }
    };

    const handleRecordPayment = async () => {
        if (!invoice || !user || paymentAmount <= 0) return;
        setIsRecordingPayment(true);
        try {
            let receiptUrl: string | undefined;
            if (receiptFile) {
                try {
                    receiptUrl = await uploadToCloudinary(receiptFile, 'receipts');
                } catch (uploadError) {
                    console.error("Receipt upload failed:", uploadError);
                    toast.error("Receipt upload failed — saving payment without receipt");
                    setReceiptFile(null);
                    if (receiptInputRef.current) receiptInputRef.current.value = "";
                }
            }

            const newPaymentRecord: any = {
                amount: paymentAmount,
                date: new Date(),
                method: paymentMethod,
                recordedBy: user.id,
                recordedByName: user.name,
            };
            if (receiptUrl) {
                newPaymentRecord.receiptUrl = receiptUrl;
            }

            const newPaymentHistory = [
                ...(invoice.paymentHistory || []),
                newPaymentRecord
            ] as any[];
            const newAmountPaid = (invoice.amountPaid || 0) + paymentAmount;
            const newPaymentStatus = newAmountPaid >= invoice.total ? 'paid' : 'partially_paid';

            await firebaseService.updateInvoice(invoice.id, {
                amountPaid: newAmountPaid,
                paymentStatus: newPaymentStatus,
                paymentHistory: newPaymentHistory
            });

            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            setPaymentAmount(0);
            setReceiptFile(null);
            if (receiptInputRef.current) receiptInputRef.current.value = "";
            toast.success(`Payment of ₦${paymentAmount.toLocaleString()} recorded`);
        } catch (error: any) {
            console.error("Error recording payment:", error);
            toast.error(error?.message || "Failed to record payment");
        } finally {
            setIsRecordingPayment(false);
        }
    };

    const handleAddLineItem = async () => {
        if (!invoice || !user) return;
        if (!newDescription.trim() || !newPrice.trim()) {
            toast.error("Please enter description and price");
            return;
        }

        setIsAddingItem(true);
        try {
            const qty = parseFloat(newQuantity) || 1;
            const price = parseFloat(newPrice) || 0;

            const newItem: InvoiceItem = {
                id: Date.now().toString(),
                description: newDescription.trim(),
                quantity: qty,
                unitPrice: price,
                total: qty * price,
                isNewAddition: invoice.paymentStatus === 'paid',
            };

            const updatedItems = [...invoice.items, newItem];
            const subtotal = updatedItems.reduce((sum, item) => sum + item.total, 0);
            const vatRate = invoice.vatRate || 0;
            const discountVal = invoice.discount || 0;
            const vatAmount = subtotal * (vatRate / 100);
            const total = subtotal + vatAmount - discountVal;

            const amountPaid = invoice.amountPaid || 0;
            let newPaymentStatus = invoice.paymentStatus;
            if (total > amountPaid) {
                newPaymentStatus = amountPaid > 0 ? 'partially_paid' : 'pending';
            } else if (total <= amountPaid && amountPaid > 0) {
                newPaymentStatus = 'paid';
            }

            await firebaseService.updateInvoice(invoice.id, {
                items: updatedItems,
                subtotal,
                total,
                vat: vatAmount,
                paymentStatus: newPaymentStatus,
            });

            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            setNewDescription("");
            setNewQuantity("1");
            setNewPrice("");
            setShowAddItem(false);
            toast.success("Line item added");
        } catch (error) {
            console.error("Error adding line item:", error);
            toast.error("Failed to add line item");
        } finally {
            setIsAddingItem(false);
        }
    };

    const handleUploadReceiptForPayment = async (file: File, paymentIndex: number) => {
        if (!invoice) return;
        setUploadingReceiptIdx(paymentIndex);
        try {
            const receiptUrl = await uploadToCloudinary(file, 'receipts');

            const updatedHistory = [...(invoice.paymentHistory || [])];
            updatedHistory[paymentIndex] = { ...updatedHistory[paymentIndex], receiptUrl };

            await firebaseService.updateInvoice(invoice.id, {
                paymentHistory: updatedHistory,
            });

            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            toast.success("Receipt uploaded");
        } catch (error) {
            console.error("Error uploading receipt:", error);
            toast.error("Failed to upload receipt");
        } finally {
            setUploadingReceiptIdx(null);
        }
    };

    const getMethodLabel = (method: string) => {
        const found = PAYMENT_METHODS.find(m => m.value === method);
        return found ? found.label : method;
    };

    const handleConfirmPendingPayment = async () => {
        if (!invoice || !user || !confirmingPendingPayment) return;
        if (confirmAmount <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }
        setIsConfirmingPayment(true);
        try {
            await firebaseService.confirmPendingPayment(
                invoice.id,
                confirmingPendingPayment.id,
                user.id,
                user.name,
                paymentMethod,
                confirmAmount
            );
            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            setConfirmingPendingPayment(null);
            setConfirmAmount(0);
            toast.success("Payment confirmed");
        } catch (error) {
            console.error("Error confirming payment:", error);
            toast.error("Failed to confirm payment");
        } finally {
            setIsConfirmingPayment(false);
        }
    };

    const handleRejectPendingPayment = async (pendingPaymentId: string) => {
        if (!invoice) return;
        try {
            await firebaseService.rejectPendingPayment(invoice.id, pendingPaymentId);
            const updated = await firebaseService.getInvoice(invoice.id);
            setInvoice(updated);
            toast.success("Payment rejected");
        } catch (error) {
            console.error("Error rejecting payment:", error);
            toast.error("Failed to reject payment");
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12 pt-8">
            <div className="flex items-center justify-between no-print">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back to Invoices
                </Button>
                <div className="flex gap-2">
                    <Button variant="outline" asChild>
                        <Link href={`/finance/invoices/${invoice.id}/edit`}>
                            <Pencil className="mr-2 h-4 w-4" /> Edit
                        </Link>
                    </Button>
                    <Button variant="outline" onClick={handlePrint}>
                        <Printer className="mr-2 h-4 w-4" /> Print
                    </Button>
                    {(invoice.status === "draft" || invoice.invoiceStatus === "pending_approval") && (
                        <Button onClick={() => invoice.status !== "draft" ? setShowApproveModal(true) : handleApprove()}>
                            <CheckCircle className="mr-2 h-4 w-4" /> {invoice.status !== "draft" ? "Approve (Manual Override)" : "Approve Invoice"}
                        </Button>
                    )}
                </div>
            </div>

            <Dialog open={showApproveModal} onOpenChange={setShowApproveModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Manual Approval</DialogTitle>
                        <DialogDescription asChild>
                            <div className="pt-4 space-y-3 text-sm text-muted-foreground">
                                <p>
                                    This customer has <strong>not yet approved</strong> this invoice via the app.
                                </p>
                                <p>
                                    By proceeding, you are confirming that you have received verbal or offline approval from the customer and wish to finalize this invoice on their behalf.
                                </p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-4">
                        <Button variant="outline" onClick={() => setShowApproveModal(false)}>
                            Cancel
                        </Button>
                        <Button className="bg-black text-white hover:bg-gray-800" onClick={handleApprove}>
                            Confirm Approval
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Card className="shadow-lg border-none print:shadow-none">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-8 border-b">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest border shadow-sm no-print",
                                    getStatusStyles(invoice.status, invoice.invoiceStatus)
                                )}>
                                {invoice.paymentStatus?.toUpperCase() || 'PENDING'}
                            </Badge>
                        </div>
                        <p className="text-sm text-gray-500 font-mono">#{invoice.invoiceNumber || invoice.id}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <img
                            src="https://res.cloudinary.com/dyg7neetr/image/upload/v1772036824/ABM_BLACK_g6i4dm.png"
                            alt="ABM TEK Logo"
                            className="h-24 w-auto mb-2"
                        />
                    </div>
                </CardHeader>

                <CardContent className="pt-8 space-y-10">
                    {/* Information Grid */}
                    <div className="grid grid-cols-2 gap-12">
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Bill To</h3>
                                <p className="text-lg font-semibold text-gray-900">{invoice.customerName || "Walk-in Customer"}</p>
                                <div className="mt-1 space-y-0.5">
                                    <p className="text-sm text-gray-600">{invoice.customerEmail}</p>
                                    <p className="text-sm text-gray-600">{invoice.customerPhone}</p>
                                    {invoice.customerAddress && <p className="text-sm text-gray-600 mt-2">{invoice.customerAddress}</p>}
                                </div>
                            </div>
                            {vehicle && (
                                <div className="mt-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Vehicle Information</h3>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {vehicle.year} {vehicle.make} {vehicle.model}
                                    </p>
                                    <p className="text-xs text-gray-500 font-mono mt-1">Plate: {vehicle.licensePlate}</p>
                                </div>
                            )}
                        </div>
                        <div className="space-y-4">
                            <div className="flex flex-col items-end text-right">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Invoice Details</h3>
                                <div className="space-y-2 w-full max-w-[200px]">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Issued:</span>
                                        <span className="font-medium">{invoice.createdAt ? format(invoice.createdAt, 'MMM d, yyyy') : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Due Date:</span>
                                        <span className="font-medium text-orange-600">{invoice.dueDate ? format(invoice.dueDate, 'MMM d, yyyy') : 'N/A'}</span>
                                    </div>
                                    <div className="flex justify-between text-sm no-print">
                                        <span className="text-gray-500">Payment:</span>
                                        <Badge variant="outline" className={cn(
                                            "capitalize text-[10px] font-bold px-2 py-0.5 border shadow-sm",
                                            invoice.paymentStatus === 'paid' ? "bg-green-50 text-green-700 border-green-200" : "bg-orange-50 text-orange-700 border-orange-200"
                                        )}>
                                            {invoice.paymentStatus?.replace('_', ' ') || 'Pending'}
                                        </Badge>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Line Items</h3>
                            <Button
                                variant="outline"
                                size="sm"
                                className="no-print h-8 text-xs"
                                onClick={() => setShowAddItem(!showAddItem)}
                            >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
                            </Button>
                        </div>

                        {showAddItem && (
                            <div className="border rounded-xl p-4 bg-blue-50/50 border-blue-100 space-y-3 no-print">
                                <div className="grid grid-cols-[1fr_80px_120px] gap-3">
                                    <div>
                                        <Label className="text-xs text-gray-500">Description</Label>
                                        <Input
                                            value={newDescription}
                                            onChange={(e) => setNewDescription(e.target.value)}
                                            placeholder="Item description"
                                            className="h-9 text-sm mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-500">Qty</Label>
                                        <Input
                                            type="number"
                                            value={newQuantity}
                                            onChange={(e) => setNewQuantity(e.target.value)}
                                            className="h-9 text-sm mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs text-gray-500">Unit Price (₦)</Label>
                                        <Input
                                            type="number"
                                            value={newPrice}
                                            onChange={(e) => setNewPrice(e.target.value)}
                                            placeholder="0"
                                            className="h-9 text-sm mt-1"
                                        />
                                    </div>
                                </div>
                                {newDescription && newPrice && (
                                    <p className="text-xs text-gray-500">
                                        Total: ₦{((parseFloat(newQuantity) || 1) * (parseFloat(newPrice) || 0)).toLocaleString()}
                                    </p>
                                )}
                                <div className="flex gap-2 justify-end">
                                    <Button variant="ghost" size="sm" onClick={() => setShowAddItem(false)} className="h-8 text-xs">
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={handleAddLineItem}
                                        disabled={isAddingItem}
                                    >
                                        {isAddingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <div className="border rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="py-4 px-6 text-left font-semibold text-gray-700">Description</th>
                                        <th className="py-4 px-6 text-center font-semibold text-gray-700 w-24">Quantity</th>
                                        <th className="py-4 px-6 text-right font-semibold text-gray-700 w-32">Unit Price</th>
                                        <th className="py-4 px-6 text-right font-semibold text-gray-700 w-32">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {invoice.items.map((item, index) => (
                                        <tr key={index} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="py-4 px-6 text-gray-800">
                                                {item.description}
                                                {item.isNewAddition && (
                                                    <Badge variant="outline" className="ml-2 text-[10px] uppercase py-0 px-1 border-blue-200 text-blue-700 bg-blue-50">New</Badge>
                                                )}
                                            </td>
                                            <td className="py-4 px-6 text-center text-gray-600">{item.quantity}</td>
                                            <td className="py-4 px-6 text-right text-gray-600">₦{item.unitPrice.toLocaleString()}</td>
                                            <td className="py-4 px-6 text-right font-medium text-gray-900">₦{item.total.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 pt-4">
                        <div className="border rounded-lg p-4 bg-gray-50/50 h-fit no-print space-y-4">
                            <h3 className="text-sm font-bold text-gray-900">Record Payment</h3>

                            {/* Payment Method Selector */}
                            <div>
                                <Label className="text-xs text-gray-500 mb-2 block">Payment Method</Label>
                                <div className="grid grid-cols-3 gap-2">
                                    {PAYMENT_METHODS.map((method) => {
                                        const Icon = method.icon;
                                        return (
                                            <button
                                                key={method.value}
                                                type="button"
                                                onClick={() => setPaymentMethod(method.value)}
                                                className={cn(
                                                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-xs font-medium",
                                                    paymentMethod === method.value
                                                        ? "border-black bg-black/5 text-black"
                                                        : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                                                )}
                                            >
                                                <Icon className="h-4 w-4" />
                                                {method.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Amount */}
                            <div>
                                <Label className="text-xs text-gray-500">Amount</Label>
                                <div className="relative mt-1">
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₦</span>
                                    <Input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                                        className="pl-7 h-9 text-sm"
                                    />
                                </div>
                                {invoice.total - (invoice.amountPaid || 0) > 0 && (
                                    <button
                                        type="button"
                                        className="text-[10px] text-blue-600 font-medium mt-1 hover:underline"
                                        onClick={() => setPaymentAmount(invoice.total - (invoice.amountPaid || 0))}
                                    >
                                        Pay full balance: ₦{(invoice.total - (invoice.amountPaid || 0)).toLocaleString()}
                                    </button>
                                )}
                            </div>

                            {/* Receipt Upload */}
                            <div>
                                <Label className="text-xs text-gray-500">Receipt (optional)</Label>
                                <div className="mt-1">
                                    <input
                                        type="file"
                                        ref={receiptInputRef}
                                        accept="image/*,.pdf"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) setReceiptFile(e.target.files[0]);
                                        }}
                                    />
                                    {receiptFile ? (
                                        <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                                            <FileText className="h-4 w-4 text-green-600 flex-shrink-0" />
                                            <span className="text-xs text-green-700 truncate flex-1">{receiptFile.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => { setReceiptFile(null); if (receiptInputRef.current) receiptInputRef.current.value = ""; }}
                                                className="text-xs text-red-500 hover:text-red-700 font-medium"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full h-9 text-xs"
                                            onClick={() => receiptInputRef.current?.click()}
                                        >
                                            <Upload className="mr-1.5 h-3.5 w-3.5" /> Attach Proof of Payment
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <Button
                                className="w-full h-9 text-sm"
                                disabled={paymentAmount <= 0 || isRecordingPayment}
                                onClick={handleRecordPayment}
                            >
                                {isRecordingPayment ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recording...</>
                                ) : (
                                    "Add Payment"
                                )}
                            </Button>
                        </div>

                        <div className="w-full flex justify-end">
                            <div className="w-80 space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Subtotal</span>
                                        <span className="text-gray-900 font-medium">₦{invoice.subtotal.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">VAT</span>
                                        <span className="text-gray-900 font-medium">₦{invoice.vat.toLocaleString()}</span>
                                    </div>
                                    {invoice.discount > 0 && (
                                        <div className="flex justify-between text-sm text-green-600 font-medium">
                                            <span>Discount</span>
                                            <span>-₦{invoice.discount.toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                                <Separator className="bg-gray-200" />
                                <div className="flex justify-between items-center">
                                    <span className="text-lg font-bold text-gray-900">Total</span>
                                    <span className="text-2xl font-bold text-gray-900">₦{invoice.total.toLocaleString()}</span>
                                </div>
                                {invoice.amountPaid !== undefined && invoice.amountPaid > 0 && (
                                    <div className="pt-2 space-y-2">
                                        <div className="flex justify-between text-sm font-semibold text-green-700">
                                            <span>Amount Paid</span>
                                            <span>₦{invoice.amountPaid.toLocaleString()}</span>
                                        </div>
                                        <Separator className="bg-gray-200" />
                                        <div className="flex justify-between text-lg font-bold text-red-600">
                                            <span>Balance Due</span>
                                            <span>₦{(invoice.total - (invoice.amountPaid || 0)).toLocaleString()}</span>
                                        </div>
                                    </div>
                                )}
                                <div className="pt-6 border-t mt-6">
                                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Amount in Words</h4>
                                    <p className="text-sm font-medium text-gray-700">
                                        {numberToWords(invoice.total)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-gray-100" />

                    <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-100">
                        <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex items-center gap-6 text-sm">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400 font-medium">Bank:</span>
                                    <span className="font-bold text-gray-900">MONIEPOINT MFB</span>
                                </div>
                                <span className="text-gray-300">|</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400 font-medium">Acc No:</span>
                                    <span className="font-black text-gray-900 tracking-wider">5071154448</span>
                                </div>
                                <span className="text-gray-300">|</span>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-400 font-medium">Name:</span>
                                    <span className="font-bold text-gray-900 uppercase">ABDULLATEEF BABA MUSTAPHA</span>
                                </div>
                            </div>
                            <span className="text-xs text-gray-400">Thank you for your patronage!</span>
                        </div>
                    </div>

                    {/* Payment History */}
                    {invoice.paymentHistory && invoice.paymentHistory.length > 0 && (
                        <div className="pt-4 no-print">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">Payment History</h3>
                            <input
                                type="file"
                                ref={historyReceiptRef}
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                    if (e.target.files?.[0] && uploadingReceiptIdx !== null) {
                                        handleUploadReceiptForPayment(e.target.files[0], uploadingReceiptIdx);
                                    }
                                }}
                            />
                            <div className="space-y-3">
                                {invoice.paymentHistory.map((payment, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-green-100 p-2 rounded-full">
                                                <CheckCircle className="h-4 w-4 text-green-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">₦{payment.amount.toLocaleString()}</p>
                                                <p className="text-xs text-gray-500">
                                                    <span className="inline-flex items-center gap-1 bg-gray-200 px-1.5 py-0.5 rounded text-gray-700 font-medium mr-1.5">
                                                        {getMethodLabel(payment.method)}
                                                    </span>
                                                    {payment.date ? format(payment.date, 'MMM d, yyyy') : 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {payment.receiptUrl ? (
                                                <a
                                                    href={payment.receiptUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                                                >
                                                    <FileText className="h-3.5 w-3.5" /> View Receipt
                                                </a>
                                            ) : (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-[11px] text-gray-400 hover:text-gray-700"
                                                    disabled={uploadingReceiptIdx === idx}
                                                    onClick={() => {
                                                        setUploadingReceiptIdx(idx);
                                                        historyReceiptRef.current?.click();
                                                    }}
                                                >
                                                    {uploadingReceiptIdx === idx ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <><Upload className="mr-1 h-3 w-3" /> Upload Receipt</>
                                                    )}
                                                </Button>
                                            )}
                                            <div className="text-right">
                                                <p className="text-[10px] uppercase font-bold text-gray-400">Recorded By</p>
                                                <p className="text-xs text-gray-600">{payment.recordedByName || 'Staff'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending Customer Payments */}
                    {invoice.pendingPayments && invoice.pendingPayments.length > 0 && (
                        <div className="pt-4 no-print">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-orange-500 mb-4 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" /> Pending Customer Payments
                            </h3>
                            <div className="space-y-3">
                                {invoice.pendingPayments.map((pp, idx) => (
                                    <div key={pp.id || idx} className="p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <p className="text-sm font-bold text-green-700">Payment proof submitted</p>
                                                <p className="text-xs text-gray-500">
                                                    {pp.date ? format(pp.date, 'MMM d, yyyy') : 'N/A'} — by {pp.recordedByName || 'Customer'}
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 text-[10px] uppercase font-bold">
                                                {pp.status}
                                            </Badge>
                                        </div>
                                        <div className="flex gap-2">
                                            {pp.proofUrl && (
                                                <a
                                                    href={pp.proofUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1"
                                                >
                                                    <Button variant="outline" size="sm" className="w-full h-8 text-xs bg-white">
                                                        <Eye className="mr-1.5 h-3.5 w-3.5" /> View Proof
                                                    </Button>
                                                </a>
                                            )}
                                            <Button
                                                size="sm"
                                                className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                                onClick={() => {
                                                    setConfirmingPendingPayment(pp);
                                                    setConfirmAmount(pp.amount || 0);
                                                }}
                                            >
                                                <CheckCircle className="mr-1.5 h-3.5 w-3.5" /> Accept
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 h-8 text-xs border-red-200 text-red-600 hover:bg-red-50"
                                                onClick={() => handleRejectPendingPayment(pp.id)}
                                            >
                                                <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Confirm Pending Payment Dialog */}
            <Dialog open={!!confirmingPendingPayment} onOpenChange={(open) => { if (!open) setConfirmingPendingPayment(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Customer Payment</DialogTitle>
                        <DialogDescription asChild>
                            <div className="pt-3 space-y-3 text-sm text-muted-foreground">
                                <p>Enter the verified payment amount to confirm this payment from <strong>{confirmingPendingPayment?.recordedByName || 'Customer'}</strong>.</p>
                            </div>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                        <div>
                            <Label className="text-xs text-gray-500">Verified Amount</Label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-2.5 text-gray-400 text-sm">₦</span>
                                <Input
                                    type="number"
                                    value={confirmAmount}
                                    onChange={(e) => setConfirmAmount(parseFloat(e.target.value) || 0)}
                                    className="pl-7"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-gray-500 mb-2 block">Payment Method</Label>
                            <div className="grid grid-cols-3 gap-2">
                                {PAYMENT_METHODS.map((method) => {
                                    const Icon = method.icon;
                                    return (
                                        <button
                                            key={method.value}
                                            type="button"
                                            onClick={() => setPaymentMethod(method.value)}
                                            className={cn(
                                                "flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all text-xs font-medium",
                                                paymentMethod === method.value
                                                    ? "border-black bg-black/5 text-black"
                                                    : "border-gray-200 text-gray-500 hover:border-gray-300"
                                            )}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {method.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button variant="outline" onClick={() => setConfirmingPendingPayment(null)}>Cancel</Button>
                        <Button
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={handleConfirmPendingPayment}
                            disabled={isConfirmingPayment || confirmAmount <= 0}
                        >
                            {isConfirmingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                            Confirm Payment
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; font-size: 11px !important; }
                    nav, header, aside, footer { display: none !important; }
                    main { padding: 0 !important; margin: 0 !important; }
                    [class*="shadow"] { box-shadow: none !important; }
                    [class*="Card"] { border: none !important; box-shadow: none !important; margin: 0 !important; }
                    table { font-size: 11px !important; }
                    th, td { padding: 0.35rem 0.5rem !important; }
                    .space-y-10 > * + * { margin-top: 1.5rem !important; }
                    .gap-12 { gap: 2rem !important; }
                    .pt-8 { padding-top: 1rem !important; }
                    .p-8 { padding: 0 !important; }
                    img { max-height: 50px !important; }
                    @page {
                      margin: 0.5cm;
                      size: A4;
                    }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .nextjs-static-indicator-toast-wrapper { display: none !important; }
                }
            `}</style>
        </div>
    );
}
