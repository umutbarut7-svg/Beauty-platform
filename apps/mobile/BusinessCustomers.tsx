import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { MvpApiClient } from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette } from "./ui";
import {
  listBusinessCustomers,
  readBusinessCustomer,
  type CustomerDetail,
} from "./src/business-customers";

export function BusinessCustomers({
  api,
  businessId,
  button,
  input,
}: {
  api: MvpApiClient;
  businessId: string;
  button: (
    label: string,
    action: () => Promise<void>,
    secondary?: boolean,
  ) => ReactNode;
  input: (
    label: string,
    value: string,
    change: (value: string) => void,
  ) => ReactNode;
}) {
  const [search, setSearch] = useState("");
  const [applied, setApplied] = useState("");
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof listBusinessCustomers>
  > | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [message, setMessage] = useState("");
  async function load(query: string, page = 1) {
    setMessage("");
    setDetail(null);
    setResult(null);
    const value = await listBusinessCustomers(api, businessId, query, page);
    setApplied(query);
    setResult(value);
  }

  if (detail) {
    const { customer, summary } = detail;
    return (
      <>
        {button("Müşteri listesine dön", async () => setDetail(null), true)}
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          {customer.firstName} {customer.lastName}
        </Text>
        {customer.phone && <Text>{customer.phone}</Text>}
        {customer.email && <Text>{customer.email}</Text>}
        <Text>Tamamlanan randevular: {summary.completedAppointments}</Text>
        <Text>Yaklaşan randevular: {summary.upcomingAppointments}</Text>
        {summary.completedValuesByCurrency?.map(
          ({ currency, completedAppointmentValue }) =>
            completedAppointmentValue !== null && (
              <Text key={currency}>
                Tamamlanan randevu tutarı:{" "}
                {formatPrice(completedAppointmentValue, currency)}
              </Text>
            ),
        )}
      </>
    );
  }

  return (
    <>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Müşteriler (CRM)</Text>
      {input("Ad, telefon veya e-posta", search, (value) =>
        setSearch(value.slice(0, 100)),
      )}
      {button("Müşterileri listele", async () => {
        const query = search.trim();
        if (query.length === 1) {
          setMessage("Arama için en az iki karakter girin.");
          return;
        }
        await load(query);
      })}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
      {result && !result.items.length && (
        <Text style={{ color: palette.muted }}>Müşteri kaydı bulunamadı.</Text>
      )}
      {result?.items.map((customer) => (
        <View key={customer.id}>
          {button(
            `${customer.firstName} ${customer.lastName}`,
            async () =>
              setDetail(
                await readBusinessCustomer(api, businessId, customer.id),
              ),
            true,
          )}
        </View>
      ))}
      {result &&
        result.page > 1 &&
        button("Önceki sayfa", () => load(applied, result.page - 1), true)}
      {result &&
        result.page < result.pages &&
        button("Sonraki sayfa", () => load(applied, result.page + 1), true)}
    </>
  );
}
