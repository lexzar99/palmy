import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export type FraudFlag =
  | "HIGH_REFUNDS_30D"
  | "HIGH_REFUND_RATE"
  | "ADDRESS_VELOCITY"
  | "PAYMENT_FAILURE_VELOCITY"
  | "NEW_ACCOUNT_LARGE_SPEND";

export interface CustomerRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  isActive: boolean;
  isVerified: boolean;
  internalInfo?: string | null;
  createdAt: string;
  totalSpent: number;
  lastOrder: string | null;
  _count?: { orders: number };
  // A12 — fraud signals
  refundCount30d?: number;
  failedPayments24h?: number;
  distinctAddresses90d?: number;
  refundRate?: number;
  accountAgeDays?: number;
  fraudFlags?: FraudFlag[];
}

export const FRAUD_FLAG_LABEL: Record<FraudFlag, string> = {
  HIGH_REFUNDS_30D: "5+ refunds/30d",
  HIGH_REFUND_RATE: "Hög refund-rate",
  ADDRESS_VELOCITY: "10+ adresser/90d",
  PAYMENT_FAILURE_VELOCITY: "Misslyckade betalningar",
  NEW_ACCOUNT_LARGE_SPEND: "Nytt konto, stor order",
};

export interface CustomerDetail extends CustomerRecord {
  orders: Array<{
    id: string;
    orderNumber: string;
    total: number;
    status: string;
    createdAt: string;
    restaurant?: { name: string } | null;
  }>;
  deals: Array<{
    id: string;
    code: string;
    usageCount: number;
    maxUsages: number;
    isUsed: boolean;
    createdAt: string;
    campaign: {
      id: string;
      title: string;
      description?: string | null;
      discountType: string;
      discountValue: number;
      minOrder: number;
      validUntil?: string | null;
    };
  }>;
}

export const customersQueryKey = ["customers", "list"] as const;
export const customerDetailQueryKey = (customerId: string | null) => ["customers", "detail", customerId] as const;

export const getCustomers = () => apiGet<CustomerRecord[]>("/customers");
export const getCustomer = (customerId: string) => apiGet<CustomerDetail>(`/customers/${customerId}`);
export const updateCustomer = (customerId: string, payload: Record<string, unknown>) => apiPatch<CustomerDetail>(`/customers/${customerId}`, payload);
export const deleteCustomer = (customerId: string) => apiDelete<{ success: boolean }>(`/customers/${customerId}`);
export const createCustomerDeal = (customerId: string, payload: Record<string, unknown>) => apiPost(`/customers/${customerId}/deals`, payload);
export const updateCustomerDeal = (customerId: string, dealId: string, payload: Record<string, unknown>) => apiPatch(`/customers/${customerId}/deals/${dealId}`, payload);
export const deleteCustomerDeal = (customerId: string, dealId: string) => apiDelete<{ success: boolean }>(`/customers/${customerId}/deals/${dealId}`);
