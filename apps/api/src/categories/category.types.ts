export const CATEGORY_CAPABILITIES = [
  "BOOKING",
  "AVAILABILITY",
  "PROFESSIONAL_MATCHING",
  "RESULT",
  "PORTFOLIO",
  "BEFORE_AFTER",
  "CONSULTATION",
  "PHOTO_INPUT",
  "AI_ANALYSIS",
  "PRODUCT_RECOMMENDATION",
  "MULTI_SESSION",
  "RESOURCE_REQUIRED",
  "ROOM_REQUIRED",
  "EQUIPMENT_REQUIRED",
  "GROUP_BOOKING",
  "DURATION_VARIANTS",
  "ADD_ON_SERVICES",
  "CUSTOM_ATTRIBUTES",
] as const;
export type CategoryCapability = (typeof CATEGORY_CAPABILITIES)[number];
export const CATEGORY_ATTRIBUTE_TYPES = [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "ENUM",
  "MULTI_ENUM",
  "DATE",
  "DURATION",
] as const;
export type CategoryAttributeType = (typeof CATEGORY_ATTRIBUTE_TYPES)[number];
export type CategoryAttributeValue = string | number | boolean | string[];
export interface CategoryContext {
  category: { id: string; key: string; name: string; version: number };
  subcategory: { id: string; key: string; name: string } | null;
  serviceType: { id: string; key: string; name: string } | null;
  capabilities: CategoryCapability[];
  requiredAttributes: Array<{
    key: string;
    type: CategoryAttributeType;
    allowedValues: string[];
  }>;
}
