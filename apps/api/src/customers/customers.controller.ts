/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  CreateBusinessCustomerDto,
  CreateCustomerNoteDto,
  CustomerListQueryDto,
  UpdateBusinessCustomerDto,
  UpdateCustomerNoteDto,
  CreateCustomerTagDto,
  UpdateCustomerTagDto,
} from "./customer.dto.js";
import { CustomersService } from "./customers.service.js";

@Controller("businesses/:businessId/customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateBusinessCustomerDto,
  ) {
    return this.customers.create(user, businessId, dto);
  }
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: CustomerListQueryDto,
  ) {
    return this.customers.list(user, businessId, query);
  }
  @Get(":customerId") detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.customers.detail(user, businessId, customerId);
  }
  @Patch(":customerId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Body() dto: UpdateBusinessCustomerDto,
  ) {
    return this.customers.update(user, businessId, customerId, dto);
  }
  @Delete(":customerId") remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.customers.delete(user, businessId, customerId);
  }
  @Get(":customerId/history") history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.customers.history(user, businessId, customerId);
  }
  @Get(":customerId/summary") summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.customers.summary(user, businessId, customerId);
  }
  @Get(":customerId/notes") notes(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
  ) {
    return this.customers.listNotes(user, businessId, customerId);
  }
  @Post(":customerId/notes") addNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Body() dto: CreateCustomerNoteDto,
  ) {
    return this.customers.addNote(user, businessId, customerId, dto);
  }
  @Patch(":customerId/notes/:noteId") updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("noteId", ResourceIdPipe) noteId: string,
    @Body() dto: UpdateCustomerNoteDto,
  ) {
    return this.customers.updateNote(user, businessId, customerId, noteId, dto);
  }
  @Delete(":customerId/notes/:noteId") deleteNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("noteId", ResourceIdPipe) noteId: string,
  ) {
    return this.customers.deleteNote(user, businessId, customerId, noteId);
  }
  @Post(":customerId/tags/:tagId") assignTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("tagId", ResourceIdPipe) tagId: string,
  ) {
    return this.customers.assignTag(user, businessId, customerId, tagId);
  }
  @Delete(":customerId/tags/:tagId") removeTag(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("customerId", ResourceIdPipe) customerId: string,
    @Param("tagId", ResourceIdPipe) tagId: string,
  ) {
    return this.customers.removeTag(user, businessId, customerId, tagId);
  }
}

@Controller("businesses/:businessId/customer-tags")
export class CustomerTagsController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.customers.listTags(user, businessId);
  }
  @Post() create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateCustomerTagDto,
  ) {
    return this.customers.createTag(user, businessId, dto);
  }
  @Patch(":tagId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("tagId", ResourceIdPipe) tagId: string,
    @Body() dto: UpdateCustomerTagDto,
  ) {
    return this.customers.updateTag(user, businessId, tagId, dto);
  }
  @Delete(":tagId") remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("tagId", ResourceIdPipe) tagId: string,
  ) {
    return this.customers.deleteTag(user, businessId, tagId);
  }
}
