import { useState, type ReactNode } from "react";
import { View } from "react-native";
import type { MvpApiClient, MvpBooking } from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette, statusLabels } from "./ui";
import {
  listBusinessCustomers,
  readBusinessCustomer,
  readAppointmentCustomers,
  type BusinessCustomer,
  type CustomerDetail,
} from "./src/business-customers";

function customerLabel(customer: BusinessCustomer) {
  return (
    [customer.firstName, customer.lastName].filter(Boolean).join(" ") ||
    customer.email ||
    customer.accountEmail ||
    customer.phone ||
    customer.alternateEmail ||
    "Müşteri profili"
  );
}

function AppointmentHistory({ items }: { items: MvpBooking[] }) {
  return (
    <View>
      <Text style={{ fontWeight: "700" }}>Son randevular</Text>
      {!items.length && <Text>Randevu kaydı bulunamadı.</Text>}
      {items.map((item) => (
        <Text key={item.id}>
          {item.service.name} ·{" "}
          {new Date(item.startsAt).toLocaleString("tr-TR")} ·{" "}
          {statusLabels[item.status] ?? "Durum bilgisi alınamadı"}
        </Text>
      ))}
    </View>
  );
}

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
  type AppointmentCustomers = Awaited<
    ReturnType<typeof readAppointmentCustomers>
  >;
  const [appointmentCustomers, setAppointmentCustomers] =
    useState<AppointmentCustomers | null>(null);
  const [appointmentCustomer, setAppointmentCustomer] = useState<
    AppointmentCustomers["items"][number] | null
  >(null);
  const [message, setMessage] = useState("");
  async function load(query: string, page = 1) {
    setMessage("");
    setDetail(null);
    setAppointmentCustomers(null);
    setAppointmentCustomer(null);
    setResult(null);
    const value = await listBusinessCustomers(api, businessId, query, page);
    setApplied(query);
    setResult(value);
  }

  if (appointmentCustomer) {
    return (
      <>
        {button(
          "Müşteri listesine dön",
          async () => setAppointmentCustomer(null),
          true,
        )}
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          {appointmentCustomer.email}
        </Text>
        <AppointmentHistory items={appointmentCustomer.appointments} />
      </>
    );
  }

  if (detail) {
    const { customer, summary } = detail;
    return (
      <>
        {button("Müşteri listesine dön", async () => setDetail(null), true)}
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          {customerLabel(customer)}
        </Text>
        {customer.phone && <Text>{customer.phone}</Text>}
        {(customer.email || customer.accountEmail) && (
          <Text>{customer.email || customer.accountEmail}</Text>
        )}
        {customer.alternateEmail && <Text>{customer.alternateEmail}</Text>}
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
        {summary && (
          <AppointmentHistory items={detail.recentAppointments ?? []} />
        )}
      </>
    );
  }

  return (
    <>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Müşteriler (CRM)</Text>
      {input("Ad, soyad, cep telefonu veya e-posta", search, (value) =>
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
      {result &&
        !appointmentCustomers &&
        button(
          "Randevulardan müşterileri getir",
          async () => {
            setAppointmentCustomers(
              await readAppointmentCustomers(api, businessId, applied),
            );
          },
          true,
        )}
      {appointmentCustomers && (
        <View>
          <Text style={{ fontWeight: "700" }}>
            CRM profili bağlanmamış randevu müşterileri
          </Text>
          {appointmentCustomers.limited && (
            <Text>Arama son 200 randevuyla sınırlı.</Text>
          )}
          {!appointmentCustomers.items.length && (
            <Text>Eşleşen randevu müşterisi bulunamadı.</Text>
          )}
          {appointmentCustomers.items.map((item) => (
            <View key={item.id}>
              {button(
                item.email,
                async () => setAppointmentCustomer(item),
                true,
              )}
            </View>
          ))}
        </View>
      )}
      {result?.items.map((customer) => (
        <View key={customer.id}>
          {button(
            customerLabel(customer),
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
