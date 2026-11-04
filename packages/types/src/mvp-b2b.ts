import type { InventoryUnit } from "./mvp-inventory.js";
export type SupplierKind =
  "BRAND" | "MANUFACTURER" | "DISTRIBUTOR" | "WHOLESALER";
export interface SupplierProfile {
  businessId: string;
  kind: SupplierKind;
  description: string;
  isListed: boolean;
  revision: number;
}
export interface B2BSupplier {
  id: string;
  name: string;
  isVerified: boolean;
  supplierProfile: { kind: SupplierKind; description: string };
}
export interface B2BProduct {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  description: string | null;
  price: string;
  currency: string;
  unit: InventoryUnit;
}
export interface B2BQuote {
  id: string;
  buyerBusinessId: string;
  supplierBusinessId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: InventoryUnit;
  quantity: string;
  buyerNote: string;
  supplierNote: string | null;
  status: "REQUESTED" | "QUOTED" | "DECLINED" | "CANCELLED";
  quotedUnitPrice: string | null;
  currency: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  buyer: { name: string };
  supplier: { name: string };
}
