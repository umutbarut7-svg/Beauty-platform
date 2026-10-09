import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { CATEGORY_CAPABILITIES } from "./category.types.js";
const ID = /^[A-Za-z0-9_-]{1,64}$/;
export class TenantCategoryConfigurationDto {
  @IsString() @Matches(ID) categoryId!: string;
  @IsOptional() @IsString() @Matches(ID) subcategoryId?: string;
  @IsOptional() @IsString() @Matches(ID) serviceTypeId?: string;
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsObject() settings?: Record<
    string,
    string | number | boolean
  >;
}
export class CategoryCapabilityQueryDto {
  @IsIn(CATEGORY_CAPABILITIES)
  capability!: (typeof CATEGORY_CAPABILITIES)[number];
}
