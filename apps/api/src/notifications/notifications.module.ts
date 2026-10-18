import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CommunicationOutboxService } from "./communication-outbox.service.js";
import {
  ConversationsController,
  PushDevicesController,
} from "./communication.controller.js";
import { MessagingService } from "./messaging.service.js";
import { PushDevicesService } from "./push-devices.service.js";
import {
  NotificationPreferencesController,
  NotificationProviderConfigsController,
  NotificationsController,
  NotificationTemplatesController,
} from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { TemplateRendererService } from "./template-renderer.service.js";
@Module({
  imports: [AuthModule],
  controllers: [
    NotificationTemplatesController,
    NotificationsController,
    NotificationPreferencesController,
    NotificationProviderConfigsController,
    PushDevicesController,
    ConversationsController,
  ],
  providers: [
    NotificationsService,
    CommunicationOutboxService,
    TemplateRendererService,
    PushDevicesService,
    MessagingService,
  ],
  exports: [NotificationsService, CommunicationOutboxService],
})
export class NotificationsModule {}
