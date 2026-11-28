import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { ApiError, type MvpApiClient } from "@beauty-platform/types";
import { AppText as Text, formatPrice, palette, statusLabels } from "./ui";
import {
  customerPaymentAmount,
  listBusinessCustomers,
  readBusinessCustomer,
  readCustomerActivity,
  readCustomerAppointment,
  type BusinessCustomer,
  type CustomerActivityItem,
  type CustomerActivitySection,
  type CustomerAppointment,
  type CustomerDetail,
} from "./src/business-customers";

type ActionButton = (
  label: string,
  action: () => Promise<void>,
  secondary?: boolean,
) => ReactNode;

const sections: Array<[CustomerActivitySection, string, string]> = [
  ["appointments", "Randevular", "Randevu kaydı bulunamadı."],
  ["services", "Alınan hizmetler", "Tamamlanan hizmet kaydı bulunamadı."],
  [
    "payments",
    "Tahsilatlar ve iadeler",
    "Randevuya bağlı tahsilat veya iade kaydı bulunamadı.",
  ],
  ["operations", "İşlem geçmişi", "Randevu durum değişikliği bulunamadı."],
];

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

const date = (value: string) => new Date(value).toLocaleString("tr-TR");
const status = (value: string) =>
  statusLabels[value] ?? "Durum bilgisi alınamadı";

function activityLabel(item: CustomerActivityItem) {
  if ("appointment" in item)
    return `${item.appointment.service.name} · ${date(item.changedAt)} · ${item.fromStatus ? `${status(item.fromStatus)} → ` : ""}${status(item.toStatus)}`;
  if ("appointmentId" in item)
    return `${item.serviceName} · ${date(item.createdAt)} · ${item.type === "REFUND" ? "İade" : "Tahsilat"} · ${customerPaymentAmount(item)}`;
  return `${item.service.name} · ${date(item.startsAt)} · ${status(item.status)}`;
}

function CustomerCard({
  api,
  businessId,
  detail,
  button,
  back,
}: {
  api: MvpApiClient;
  businessId: string;
  detail: CustomerDetail;
  button: ActionButton;
  back: () => void;
}) {
  const { customer, summary } = detail;
  const [selected, setSelected] = useState<CustomerAppointment | null>(null);
  const [activity, setActivity] = useState<{
    section: CustomerActivitySection;
    items: CustomerActivityItem[];
    nextCursor: string | null;
  } | null>(null);
  const [message, setMessage] = useState("");

  async function load(section: CustomerActivitySection, cursor?: string) {
    setMessage("");
    if (!cursor) setActivity(null);
    try {
      const page = await readCustomerActivity(
        api,
        businessId,
        customer.id,
        section,
        cursor,
      );
      setActivity((previous) => {
        const items =
          cursor && previous?.section === section
            ? [
                ...previous.items,
                ...page.items.filter(
                  (item) => !previous.items.some(({ id }) => id === item.id),
                ),
              ]
            : page.items;
        return { section, items, nextCursor: page.nextCursor };
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setMessage("Bu geçmişi görüntüleme yetkiniz yok.");
        return;
      }
      throw error;
    }
  }

  if (selected)
    return (
      <>
        {button("Müşteri kartına dön", async () => setSelected(null), true)}
        <Text style={{ fontSize: 20, fontWeight: "700" }}>
          {selected.service.name}
        </Text>
        <Text>
          {status(selected.status)} · {date(selected.startsAt)} –{" "}
          {date(selected.endsAt)}
        </Text>
        {selected.location && <Text>Konum: {selected.location.name}</Text>}
        {selected.staff && <Text>Uzman: {selected.staff.displayName}</Text>}
        <Text>
          Randevu tutarı: {formatPrice(selected.price, selected.currency)}
        </Text>
      </>
    );

  return (
    <>
      {button("Müşteri listesine dön", async () => back(), true)}
      <Text style={{ fontSize: 20, fontWeight: "700" }}>
        {customerLabel(customer)}
      </Text>
      {customer.phone && <Text>{customer.phone}</Text>}
      {customer.email && <Text>{customer.email}</Text>}
      {customer.accountEmail && customer.accountEmail !== customer.email && (
        <Text>{customer.accountEmail}</Text>
      )}
      {customer.alternateEmail && (
        <Text>Alternatif e-posta: {customer.alternateEmail}</Text>
      )}
      {!!customer.tags?.length && (
        <Text>
          Etiketler: {customer.tags.map(({ tag }) => tag.name).join(", ")}
        </Text>
      )}
      {customer.notes && <Text>Profil notu: {customer.notes}</Text>}
      {summary.totalAppointments !== undefined && (
        <Text>Toplam randevu: {summary.totalAppointments}</Text>
      )}
      <Text>Tamamlanan randevular: {summary.completedAppointments}</Text>
      <Text>Yaklaşan randevular: {summary.upcomingAppointments}</Text>
      {summary.lastVisitAt && (
        <Text>Son ziyaret: {date(summary.lastVisitAt)}</Text>
      )}
      {summary.nextAppointmentAt && (
        <Text>Sonraki randevu: {date(summary.nextAppointmentAt)}</Text>
      )}
      {summary.completedValuesByCurrency?.map(
        ({ currency, completedAppointmentValue }) =>
          completedAppointmentValue !== null && (
            <Text key={currency}>
              Tamamlanan randevu tutarı:{" "}
              {formatPrice(completedAppointmentValue, currency)}
            </Text>
          ),
      )}
      {sections.map(([section, label]) => (
        <View key={section}>
          {button(label, () => load(section), activity?.section !== section)}
        </View>
      ))}
      {!!message && <Text accessibilityRole="alert">{message}</Text>}
      {activity && (
        <>
          {!activity.items.length && (
            <Text>
              {sections.find(([section]) => section === activity.section)?.[2]}
            </Text>
          )}
          {activity.items.map((item) => (
            <View key={item.id}>
              {button(
                activityLabel(item),
                async () => {
                  const appointmentId =
                    "appointment" in item
                      ? item.appointment.id
                      : "appointmentId" in item
                        ? item.appointmentId
                        : item.id;
                  setSelected(
                    await readCustomerAppointment(
                      api,
                      businessId,
                      customer.id,
                      appointmentId,
                    ),
                  );
                },
                true,
              )}
            </View>
          ))}
          {activity.nextCursor &&
            button(
              "Daha fazla göster",
              () => load(activity.section, activity.nextCursor ?? undefined),
              true,
            )}
        </>
      )}
    </>
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
  button: ActionButton;
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
    const value = await listBusinessCustomers(api, businessId, query, page);
    setApplied(query);
    setResult(value);
  }

  if (detail)
    return (
      <CustomerCard
        key={detail.customer.id}
        api={api}
        businessId={businessId}
        detail={detail}
        button={button}
        back={() => setDetail(null)}
      />
    );

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
