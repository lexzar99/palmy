import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/shared/api/client";

export type ReceiptAlign = "left" | "center" | "right";
export type ReceiptWeight = "normal" | "bold" | "black";

export interface ReceiptElement {
  key: string;
  label: string;
  content?: string | null;
  visible: boolean;
  size: number;
  weight: ReceiptWeight;
  align: ReceiptAlign;
  uppercase?: boolean;
}

export interface ReceiptTemplate {
  paperWidth: "58mm" | "80mm" | "A4";
  platformName: string;
  elements: ReceiptElement[];
}

export interface PrinterRecord {
  id: string;
  restaurantId: string;
  restaurantName?: string | null;
  name: string;
  connectionType: "NETWORK" | "BLUETOOTH";
  address: string;
  paperWidth: "58mm" | "80mm" | "A4";
  copies: number;
  autoPrint: boolean;
  isDefault: boolean;
  isActive: boolean;
  receiptMode: "STANDARD" | "COMPACT" | "DETAILED";
  notes?: string | null;
  lastSeenAt?: string | null;
  status: "ONLINE" | "STALE" | "OFFLINE" | "UNKNOWN";
}

export interface PrintingConfig {
  scope: { restaurantId: string | null; isSuperAdmin: boolean };
  template: ReceiptTemplate;
  printers: PrinterRecord[];
  defaultPrinter: PrinterRecord | null;
}

export interface ReceiptPreviewOption {
  id: string;
  orderNumber: string;
  customerName: string;
  createdAt: string;
  restaurantName?: string;
}

export interface ReceiptPreviewData {
  header?: Record<string, unknown>;
  orderInfo?: Record<string, unknown>;
  customer?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
  footer?: string;
  template?: ReceiptTemplate;
}

export const printingConfigQueryKey = ["receipts", "config"] as const;
export const receiptPreviewOrdersQueryKey = ["receipts", "orders"] as const;
export const receiptPreviewDataQueryKey = (orderId: string | null) => ["receipts", "preview", orderId] as const;

export const getPrintingConfig = () => apiGet<PrintingConfig>("/admin/printing/config");
export const updateReceiptTemplate = (payload: ReceiptTemplate) => apiPut<ReceiptTemplate>("/admin/printing/receipt-template", payload);
export const createPrinter = (payload: Record<string, unknown>) => apiPost<PrinterRecord>("/admin/printing/printers", payload);
export const updatePrinter = (printerId: string, payload: Record<string, unknown>) => apiPatch<PrinterRecord>(`/admin/printing/printers/${printerId}`, payload);
export const deletePrinter = (printerId: string) => apiDelete<{ success: boolean }>(`/admin/printing/printers/${printerId}`);
export const getPreviewOrders = async () => {
  const response = await apiGet<{ orders: ReceiptPreviewOption[] }>("/admin/orders?limit=20");
  return response.orders;
};
export const getReceiptPreview = (orderId: string) => apiGet<ReceiptPreviewData>(`/admin/orders/${orderId}/receipt-data`);
