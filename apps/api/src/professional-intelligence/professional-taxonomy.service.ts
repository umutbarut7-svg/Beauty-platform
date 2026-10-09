import { BadRequestException, Injectable } from "@nestjs/common";
import { PROFESSIONAL_SKILL_CATEGORIES } from "./professional-intelligence.types.js";
@Injectable()
export class ProfessionalTaxonomyService {
  assert(category: string, code: string) {
    if (
      !(PROFESSIONAL_SKILL_CATEGORIES as readonly string[]).includes(category)
    )
      throw new BadRequestException("Unsupported skill category");
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code))
      throw new BadRequestException("Invalid skill code");
  }
}
