/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  CreateConversationDto,
  MessageListQueryDto,
  SendMessageDto,
} from "./messaging.dto.js";
import { MessagingService } from "./messaging.service.js";
import { RegisterPushDeviceDto } from "./notification.dto.js";
import { PushDevicesService } from "./push-devices.service.js";
@Controller("businesses/:businessId/push-devices")
export class PushDevicesController {
  constructor(private readonly s: PushDevicesService) {}
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.list(u, b);
  }
  @Post() register(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: RegisterPushDeviceDto,
  ) {
    return this.s.register(u, b, d);
  }
  @Delete(":id") revoke(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.revoke(u, b, id);
  }
}
@Controller("businesses/:businessId/conversations")
export class ConversationsController {
  constructor(private readonly s: MessagingService) {}
  @Post() create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateConversationDto,
  ) {
    return this.s.create(u, b, d);
  }
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.list(u, b);
  }
  @Get(":id") detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.detail(u, b, id);
  }
  @Get(":id/messages") messages(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Query() q: MessageListQueryDto,
  ) {
    return this.s.messages(u, b, id, q);
  }
  @Post(":id/messages") send(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Body() d: SendMessageDto,
  ) {
    return this.s.send(u, b, id, d);
  }
  @Post(":id/messages/:messageId/read") read(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Param("messageId", ResourceIdPipe) m: string,
  ) {
    return this.s.markRead(u, b, id, m);
  }
}
