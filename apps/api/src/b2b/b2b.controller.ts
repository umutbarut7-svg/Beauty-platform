/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import { B2BService } from "./b2b.service.js";
import {
  B2BPageDto,
  QuoteCancelDto,
  QuotePageDto,
  QuoteReplyDto,
  QuoteRequestDto,
  SupplierProfileDto,
} from "./b2b.dto.js";
@Controller("businesses/:businessId/b2b")
export class B2BController {
  constructor(private readonly b2b: B2BService) {}
  @Get("profile") profile(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.b2b.profile(u, b);
  }
  @Patch("profile") save(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() dto: SupplierProfileDto,
  ) {
    return this.b2b.saveProfile(u, b, dto);
  }
  @Get("suppliers") suppliers(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query() p: B2BPageDto,
  ) {
    return this.b2b.suppliers(u, b, p);
  }
  @Get("suppliers/:supplierId/products") products(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("supplierId", ResourceIdPipe) s: string,
    @Query() p: B2BPageDto,
  ) {
    return this.b2b.products(u, b, s, p);
  }
  @Post("quotes") request(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() dto: QuoteRequestDto,
  ) {
    return this.b2b.requestQuote(u, b, dto);
  }
  @Get("quotes") quotes(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query() p: QuotePageDto,
  ) {
    return this.b2b.quotes(u, b, p);
  }
  @Post("quotes/:quoteId/reply") reply(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("quoteId", ResourceIdPipe) q: string,
    @Body() dto: QuoteReplyDto,
  ) {
    return this.b2b.reply(u, b, q, dto);
  }
  @Post("quotes/:quoteId/cancel") cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("quoteId", ResourceIdPipe) q: string,
    @Body() dto: QuoteCancelDto,
  ) {
    return this.b2b.cancel(u, b, q, dto.expectedRevision);
  }
}
