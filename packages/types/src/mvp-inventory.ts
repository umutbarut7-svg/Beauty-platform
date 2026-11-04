export type InventoryUnit = "UNIT" | "ML" | "G";
export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  description: string | null;
  price: string;
  currency: string;
  unit: InventoryUnit;
  stockQuantity: string;
  lowStockThreshold: string;
  isPublic: boolean;
  isActive: boolean;
  revision: number;
}
export type PublicProduct = Pick<
  CatalogProduct,
  | "id"
  | "sku"
  | "name"
  | "brand"
  | "description"
  | "price"
  | "currency"
  | "unit"
> & { availability: "IN_STOCK" | "OUT_OF_STOCK" };
export interface ProductPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ProductImportRow {
  sku: string;
  name: string;
  brand?: string;
  price: string;
  currency: string;
  unit: InventoryUnit;
  lowStockThreshold: string;
}
export interface StockMovement {
  id: string;
  direction: "IN" | "OUT";
  quantity: string;
  quantityAfter: string;
  reason: string;
  createdAt: string;
}
