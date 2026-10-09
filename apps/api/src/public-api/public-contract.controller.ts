import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/auth.decorators.js";
@Public()
@Controller("api/public/v1")
export class PublicContractController {
  @Get("openapi.json") contract() {
    return {
      openapi: "3.1.0",
      info: { title: "Beauty Platform Public API", version: "1.0.0" },
      servers: [{ url: "/api/public/v1" }],
      components: {
        securitySchemes: {
          ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
        schemas: {
          Error: { type: "object", required: ["error"] },
          StableMeta: {
            type: "object",
            properties: {
              apiVersion: { const: "v1" },
              deprecated: { type: "boolean" },
              sunsetAt: { type: ["string", "null"] },
              replacement: { type: ["string", "null"] },
            },
          },
        },
      },
      security: [{ ApiKey: [] }],
      paths: {
        "/business": {
          get: {
            operationId: "getBusiness",
            "x-required-scopes": ["business.read"],
          },
        },
        "/categories": {
          get: {
            operationId: "getCategories",
            "x-required-scopes": ["services.read"],
          },
        },
        "/globalization/context": {
          get: {
            operationId: "getGlobalizationContext",
            "x-required-scopes": ["business.read"],
          },
        },
        "/services": {
          get: {
            operationId: "getServices",
            "x-required-scopes": ["services.read"],
          },
        },
        "/professionals": {
          get: {
            operationId: "getProfessionals",
            "x-required-scopes": ["professionals.read"],
          },
        },
        "/availability": {
          get: {
            operationId: "getAvailability",
            "x-required-scopes": ["availability.read"],
          },
        },
        "/bookings": {
          post: {
            operationId: "createBooking",
            "x-required-scopes": ["booking.write"],
          },
        },
        "/bookings/{id}": {
          get: {
            operationId: "getBooking",
            "x-required-scopes": ["booking.read"],
          },
          delete: {
            operationId: "cancelBooking",
            "x-required-scopes": ["booking.write"],
          },
        },
        "/results/{id}": {
          get: {
            operationId: "getResult",
            "x-required-scopes": ["result.read"],
            deprecated: false,
          },
        },
        "/discovery": {
          get: {
            operationId: "searchBusinesses",
            "x-required-scopes": ["discovery.read"],
          },
        },
        "/ai/tools": { get: { operationId: "listAiTools" } },
      },
    };
  }
}
