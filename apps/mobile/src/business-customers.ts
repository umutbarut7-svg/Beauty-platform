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
};

type CustomerPage = { items: BusinessCustomer[]; page: number; pages: number };

export type CustomerDetail = {
  customer: BusinessCustomer;
  recentAppointments?: MvpBooking[];
  summary: {
    completedAppointments: number;
    upcomingAppointments: number;
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

export async function readAppointmentCustomers(
  api: Pick<MvpApiClient, "request">,
  businessId: string,
  search: string,
) {
  const path = `/businesses/${encodeURIComponent(businessId)}/appointments`;
  const rows = await api.request<BusinessBooking[]>(path);
  const query = search.toLocaleLowerCase("tr-TR");
  const customers = new Map<
    string,
    { id: string; email: string; appointments: MvpBooking[] }
  >();
  for (const item of rows) {
    const email = businessBookingEmail(item, businessId);
    const id = item.customer?.id;
    if (
      !id ||
      !email ||
      item.businessCustomerId ||
      !email.toLocaleLowerCase("tr-TR").includes(query)
    )
      continue;
    const existing = customers.get(id);
    if (existing) {
      existing.appointments.push(item);
    } else {
      customers.set(id, { id, email, appointments: [item] });
    }
  }
  return { items: [...customers.values()], limited: rows.length >= 200 };
}
