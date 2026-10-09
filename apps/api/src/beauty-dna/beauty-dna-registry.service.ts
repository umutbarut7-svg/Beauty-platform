import { BadRequestException, Injectable } from "@nestjs/common";
import {
  BEAUTY_DNA_CATEGORIES,
  PROHIBITED_TRAITS,
  type BeautyDNACategory,
} from "./beauty-dna.types.js";
@Injectable()
export class BeautyDNARegistry {
  assertAllowed(
    category: string,
    traitType: string,
  ): asserts category is BeautyDNACategory {
    if (!(BEAUTY_DNA_CATEGORIES as readonly string[]).includes(category))
      throw new BadRequestException("Unsupported Beauty DNA category");
    const normalized = traitType.trim().toLocaleLowerCase("en-US");
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(normalized))
      throw new BadRequestException("Invalid trait type");
    if (
      (PROHIBITED_TRAITS as readonly string[]).some((x) =>
        normalized.includes(x),
      )
    )
      throw new BadRequestException("Sensitive inference is prohibited");
  }
}
