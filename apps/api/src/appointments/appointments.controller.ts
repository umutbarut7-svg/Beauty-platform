/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
  AvailabilityQueryDto,
  CancelAppointmentDto,
  CreateAppointmentDto,
  CreateStaffTimeOffDto,
  ReplaceStaffWorkingHoursDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  UpdateStaffTimeOffDto,
} from "./appointment.dto.js";
import { AppointmentsService } from "./appointments.service.js";

@Controller("businesses/:businessId")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get("availability") availability(
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.appointments.availabilityFor(
      businessId,
      query.serviceId,
      query.staffMemberId,
      query.date,
      query.locationId,
    );
  }
  @Get("appointments") list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
  ) {
    return this.appointments.list(user, businessId);
  }
  @Get("appointments/:appointmentId") get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
  ) {
    return this.appointments.get(user, businessId, appointmentId);
  }
  @Post("appointments") create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointments.create(user, businessId, dto);
  }
  @Patch("appointments/:appointmentId") update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointments.update(user, businessId, appointmentId, dto);
  }
  @Post("appointments/:appointmentId/cancel") cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointments.cancel(user, businessId, appointmentId, dto);
  }
  @Patch("appointments/:appointmentId/status") status(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.changeStatus(
      user,
      businessId,
      appointmentId,
      dto.status,
      dto.reason,
    );
  }
  @Get("appointments/:appointmentId/status-history") history(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("appointmentId", ResourceIdPipe) appointmentId: string,
  ) {
    return this.appointments.statusHistory(user, businessId, appointmentId);
  }
}

@Controller("businesses/:businessId/staff/:memberId")
export class StaffAvailabilityController {
  constructor(private readonly appointments: AppointmentsService) {}
  @Get("working-hours") hours(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
  ) {
    return this.appointments.getStaffHours(user, businessId, memberId);
  }
  @Put("working-hours") replaceHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Body() dto: ReplaceStaffWorkingHoursDto,
  ) {
    return this.appointments.replaceStaffHours(user, businessId, memberId, dto);
  }
  @Get("time-off") timeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
  ) {
    return this.appointments.listTimeOff(user, businessId, memberId);
  }
  @Post("time-off") addTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Body() dto: CreateStaffTimeOffDto,
  ) {
    return this.appointments.addTimeOff(user, businessId, memberId, dto);
  }
  @Delete("time-off/:timeOffId") @HttpCode(204) deleteTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Param("timeOffId", ResourceIdPipe) timeOffId: string,
  ) {
    return this.appointments.deleteTimeOff(
      user,
      businessId,
      memberId,
      timeOffId,
    );
  }
  @Patch("time-off/:timeOffId") updateTimeOff(
    @CurrentUser() user: AuthenticatedUser,
    @Param("businessId", ResourceIdPipe) businessId: string,
    @Param("memberId", ResourceIdPipe) memberId: string,
    @Param("timeOffId", ResourceIdPipe) timeOffId: string,
    @Body() dto: UpdateStaffTimeOffDto,
  ) {
    return this.appointments.updateTimeOff(
      user,
      businessId,
      memberId,
      timeOffId,
      dto,
    );
  }
}
