/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CurrentUser } from "../auth/auth.decorators.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ResourceIdPipe } from "../businesses/resource-id.pipe.js";
import {
  CreateNotificationDto,
  CreateTemplateDto,
  NotificationListQueryDto,
  PreferenceDto,
  ProviderConfigDto,
  TemplateListQueryDto,
  UpdateTemplateDto,
} from "./notification.dto.js";
import { NotificationsService } from "./notifications.service.js";
@Controller("businesses/:businessId/notification-templates")
export class NotificationTemplatesController {
  constructor(private readonly s: NotificationsService) {}
  @Post() create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateTemplateDto,
  ) {
    return this.s.createTemplate(u, b, d);
  }
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query() q: TemplateListQueryDto,
  ) {
    return this.s.listTemplates(u, b, q);
  }
  @Get(":id") get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.template(u, b, id);
  }
  @Patch(":id") update(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
    @Body() d: UpdateTemplateDto,
  ) {
    return this.s.updateTemplate(u, b, id, d);
  }
  @Delete(":id") archive(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.archiveTemplate(u, b, id);
  }
}
@Controller("businesses/:businessId/notifications")
export class NotificationsController {
  constructor(private readonly s: NotificationsService) {}
  @Post() create(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: CreateNotificationDto,
  ) {
    return this.s.create(u, b, d);
  }
  @Get() list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query() q: NotificationListQueryDto,
  ) {
    return this.s.list(u, b, q);
  }
  @Get("unread-count") unread(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.unreadCount(u, b);
  }
  @Post("mark-all-read") markAll(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.markAllRead(u, b);
  }
  @Post(":id/read") read(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.markRead(u, b, id);
  }
  @Get(":id") get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.get(u, b, id);
  }
  @Post(":id/send") send(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.send(u, b, id);
  }
  @Post(":id/cancel") cancel(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.cancel(u, b, id);
  }
  @Post(":id/retry") retry(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Param("id", ResourceIdPipe) id: string,
  ) {
    return this.s.retry(u, b, id);
  }
}
@Controller("businesses/:businessId/notification-preferences")
export class NotificationPreferencesController {
  constructor(private readonly s: NotificationsService) {}
  @Get() get(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Query("customerId") c?: string,
    @Query("userId") x?: string,
  ) {
    return this.s.preferences(u, b, c, x);
  }
  @Put() set(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: PreferenceDto,
  ) {
    return this.s.setPreference(u, b, d);
  }
}

@Controller("businesses/:businessId/notification-provider-configs")
export class NotificationProviderConfigsController {
  constructor(private readonly s: NotificationsService) {}
  @Get()
  list(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
  ) {
    return this.s.providerConfigs(u, b);
  }
  @Put()
  set(
    @CurrentUser() u: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) b: string,
    @Body() d: ProviderConfigDto,
  ) {
    return this.s.setProviderConfig(u, b, d);
  }
}
