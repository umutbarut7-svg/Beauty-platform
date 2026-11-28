import type { MvpApiClient, MvpBooking } from "@beauty-platform/types";

export type BusinessCustomer = {
  id: string;
  businessId: string;
  firstName: string | null;
  lastName: string | null;
  accountEmail?: string | null;
  alternateEmail?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: Array<{ tag: { id: string; name: string } }>;
};

type CustomerPage = { items: BusinessCustomer[]; page: number; pages: number };

export type CustomerDetail = {
  customer: BusinessCustomer;
  recentAppointments?: MvpBooking[];
  summary: {
    completedAppointments: number;
    upcomingAppointments: number;
    totalAppointments?: number;
    cancelledAppointments?: number;
    noShowAppointments?: number;
    lastVisitAt?: string | null;
    nextAppointmentAt?: string | null;
    completedValuesByCurrency?: Array<{
      currency: string;
      completedAppointmentValue: string | null;
    }>;
  };
};

export async function listBusinessCustomers(
  api: Pick<MvpApiClient, "request">,
  businessId: string,
  search: string,
  page: number,
) {
  const path = `/businesses/${encodeURIComponent(businessId)}/customers`;
  const query = new URLSearchParams({ page: String(page), limit: "25" });
  if (search) query.set("search", search);
  const result = await api.request<CustomerPage>(`${path}?${query}`);
  if (result.items.some((item) => item.businessId !== businessId))
    throw new Error("Customer list scope mismatch");
  return result;
}

export async function readBusinessCustomer(
  api: Pick<MvpApiClient, "request">,
  businessId: string,
  customerId: string,
) {
  const path = `/businesses/${encodeURIComponent(businessId)}/customers`;
  const result = await api.request<CustomerDetail>(
    `${path}/${encodeURIComponent(customerId)}`,
  );
  if (
    result.customer.businessId !== businessId ||
    result.customer.id !== customerId ||
    result.recentAppointments?.some((item) => item.businessId !== businessId)
  )
    throw new Error("Customer detail scope mismatch");
  return result;
}

export type BusinessBooking = MvpBooking & {
  businessCustomerId?: string | null;
  customer?: { id: string; user?: { email?: string | null } | null };
};

export function businessBookingEmail(
  item: BusinessBooking,
  businessId: string,
) {
  if (item.businessId !== businessId || !item.customer?.id) return null;
  return item.customer.user?.email?.trim() || null;
}

export type CustomerActivitySection =
  "appointments" | "services" | "payments" | "operations";

export type CustomerAppointment = MvpBooking & {
  businessCustomerId: string;
  endsAt: string;
  location: { name: string } | null;
  staff: { displayName: string } | null;
};

type AppointmentReference = {
  id: string;
  businessId: string;
  businessCustomerId: string;
  service: { name: string };
};

type CustomerPayment = {
  id: string;
  businessId: string;
  businessCustomerId: string;
  appointmentId: string;
  serviceName: string;
  type: "CHARGE" | "REFUND";
  amountMinor: string;
  currency: string;
  minorUnit: number | null;
  createdAt: string;
};

type CustomerOperation = {
  id: string;
  businessId: string;
  appointment: AppointmentReference;
  changedAt: string;
  fromStatus: string | null;
  toStatus: string;
};

export type CustomerActivityItem =
  CustomerAppointment | CustomerPayment | CustomerOperation;
type ActivityPage = {
  items: CustomerActivityItem[];
  nextCursor: string | null;
};

function customerPath(businessId: string, customerId: string) {
  return `/businesses/${encodeURIComponent(businessId)}/customers/${encodeURIComponent(customerId)}`;
}

function belongsTo(
  row: { businessId: string; businessCustomerId?: string | null },
  businessId: string,
  customerId: string,
) {
  return row.businessId === businessId && row.businessCustomerId === customerId;
}

export async function readCustomerActivity(
  api: Pick<MvpApiClient, "request">,
  businessId: string,
  customerId: string,
  section: CustomerActivitySection,
  cursor?: string,
) {
  const query = new URLSearchParams({ section });
  if (cursor) query.set("cursor", cursor);
  const page = await api.request<ActivityPage>(
    `${customerPath(businessId, customerId)}/activity?${query}`,
  );
  if (
    page.items.some((row) => {
      if (row.businessId !== businessId) return true;
      if (section === "operations")
        return !(
          "appointment" in row &&
          belongsTo(row.appointment, businessId, customerId)
        );
      if ("appointment" in row || !belongsTo(row, businessId, customerId))
        return true;
      return (section === "payments") !== "appointmentId" in row;
    })
  )
    throw new Error("Customer activity scope mismatch");
  return page;
}

export async function readCustomerAppointment(
  api: Pick<MvpApiClient, "request">,
  businessId: string,
  customerId: string,
  appointmentId: string,
) {
  const row = await api.request<CustomerAppointment>(
    `${customerPath(businessId, customerId)}/appointments/${encodeURIComponent(appointmentId)}`,
  );
  if (!belongsTo(row, businessId, customerId) || row.id !== appointmentId)
    throw new Error("Customer appointment scope mismatch");
  return row;
}

export function customerPaymentAmount({
  amountMinor,
  currency,
  minorUnit,
}: CustomerPayment) {
  if (!/^\d+$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency))
    return "Tutar alınamadı";
  if (
    minorUnit === null ||
    !Number.isInteger(minorUnit) ||
    minorUnit < 0 ||
    minorUnit > 6
  )
    return `${amountMinor} ${currency} (alt birim)`;
  if (minorUnit === 0) return `${amountMinor} ${currency}`;
  const digits = amountMinor.padStart(minorUnit + 1, "0");
  return `${digits.slice(0, -minorUnit)},${digits.slice(-minorUnit)} ${currency}`;
}
