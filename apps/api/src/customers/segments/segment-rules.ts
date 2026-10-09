import { BadRequestException } from "@nestjs/common";
import {
  RULE_FIELDS,
  RULE_OPERATORS,
  type SegmentRuleDto,
} from "./segment.dto.js";
export function validateRules(rules: SegmentRuleDto[]) {
  const numeric = new Set([
    "totalAppointments",
    "completedAppointments",
    "cancelledAppointments",
    "noShowAppointments",
    "totalSpend",
    "averageSpend",
    "daysSinceLastVisit",
  ]);
  const boolean = new Set(["marketingConsent", "smsConsent", "emailConsent"]);
  for (const rule of rules) {
    if (!RULE_FIELDS.includes(rule.field))
      throw new BadRequestException(`Unsupported rule field: ${rule.field}`);
    if (!RULE_OPERATORS.includes(rule.operator))
      throw new BadRequestException(
        `Unsupported rule operator: ${rule.operator}`,
      );
    if (rule.value === undefined || rule.value === null)
      throw new BadRequestException("Rule value is required");
    if (["in", "notIn"].includes(rule.operator) && !Array.isArray(rule.value))
      throw new BadRequestException(`${rule.operator} requires an array`);
    const values = Array.isArray(rule.value) ? rule.value : [rule.value];
    if (
      numeric.has(rule.field) &&
      values.some((value) => typeof value !== "number")
    )
      throw new BadRequestException(`${rule.field} requires numeric values`);
    if (
      boolean.has(rule.field) &&
      values.some((value) => typeof value !== "boolean")
    )
      throw new BadRequestException(`${rule.field} requires boolean values`);
    if (
      ["lastVisitAt", "nextAppointmentAt"].includes(rule.field) &&
      values.some(
        (value) => typeof value !== "string" || Number.isNaN(Date.parse(value)),
      )
    )
      throw new BadRequestException(`${rule.field} requires ISO date values`);
    if (rule.operator === "contains" && rule.field !== "tags")
      throw new BadRequestException("contains is only supported for tags");
  }
}
export function matchesRules(
  values: Record<string, unknown>,
  rules: SegmentRuleDto[],
) {
  return rules.every((r) => compare(values[r.field], r.operator, r.value));
}
function compare(actual: unknown, op: string, expected: unknown) {
  const isDate = actual instanceof Date;
  const a = isDate ? actual.getTime() : actual;
  const e =
    isDate && typeof expected === "string" ? Date.parse(expected) : expected;
  switch (op) {
    case "eq":
      return a === e;
    case "neq":
      return a !== e;
    case "gt":
      return Number(a) > Number(e);
    case "gte":
      return Number(a) >= Number(e);
    case "lt":
      return Number(a) < Number(e);
    case "lte":
      return Number(a) <= Number(e);
    case "in":
      return (e as unknown[]).includes(a);
    case "notIn":
      return !(e as unknown[]).includes(a);
    case "contains":
      return Array.isArray(a)
        ? a.includes(e)
        : String(a ?? "").includes(String(e));
    default:
      return false;
  }
}
