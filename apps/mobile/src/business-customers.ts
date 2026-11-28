import type { MvpApiClient } from "@beauty-platform/types";

export type BusinessCustomer = {
  id: string;
  businessId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

type CustomerPage = { items: BusinessCustomer[]; page: number; pages: number };

export type CustomerDetail = {
  customer: BusinessCustomer;
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
    result.customer.id !== customerId
  )
    throw new Error("Customer detail scope mismatch");
  return result;
}
