import { BadRequestException, Injectable } from "@nestjs/common";
const TOKEN = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;
@Injectable()
export class TemplateRendererService {
  render(
    template: { subject?: string | null; body: string; variables: unknown },
    values: Record<string, unknown>,
  ) {
    const required = Array.isArray(template.variables)
      ? template.variables.map(String)
      : [];
    for (const key of required)
      if (this.resolve(values, key) === undefined)
        throw new BadRequestException(`Missing template variable: ${key}`);
    return {
      subject: template.subject
        ? this.text(template.subject, values)
        : undefined,
      body: this.text(template.body, values),
    };
  }
  private text(input: string, values: Record<string, unknown>) {
    return input.replace(TOKEN, (_, key: string) => {
      const v = this.resolve(values, key);
      if (v === undefined)
        throw new BadRequestException(`Missing template variable: ${key}`);
      return this.escape(String(v));
    });
  }
  private resolve(root: Record<string, unknown>, path: string): unknown {
    return path
      .split(".")
      .reduce<unknown>(
        (v, k) =>
          v && typeof v === "object"
            ? (v as Record<string, unknown>)[k]
            : undefined,
        root,
      );
  }
  private escape(v: string) {
    return v.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c]!,
    );
  }
}
