/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type {
  ApiPrincipal,
  ExternalAiToolContract,
} from "./public-api.types.js";
import { ApiCredentialService } from "./api-credential.service.js";
@Injectable()
export class ExternalAiToolsService {
  constructor(private readonly credentials: ApiCredentialService) {}
  private readonly contracts: ExternalAiToolContract[] = [
    {
      name: "searchBusinesses",
      operation: "READ",
      requiredScopes: ["discovery.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "getBusiness",
      operation: "READ",
      requiredScopes: ["business.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "getCategoryContext",
      operation: "READ",
      requiredScopes: ["services.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object", required: ["serviceId"] },
      outputSchema: { type: "object" },
    },
    {
      name: "getGlobalizationContext",
      operation: "READ",
      requiredScopes: ["business.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "getServices",
      operation: "READ",
      requiredScopes: ["services.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "array" },
    },
    {
      name: "getProfessionals",
      operation: "READ",
      requiredScopes: ["professionals.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "array" },
    },
    {
      name: "getAvailability",
      operation: "READ",
      requiredScopes: ["availability.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "array" },
    },
    {
      name: "createBooking",
      operation: "WRITE",
      requiredScopes: ["booking.write"],
      requiresConfirmation: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "getBooking",
      operation: "READ",
      requiredScopes: ["booking.read"],
      requiresConfirmation: false,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
    {
      name: "cancelBooking",
      operation: "WRITE",
      requiredScopes: ["booking.write"],
      requiresConfirmation: true,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  ];
  list() {
    return this.contracts;
  }
  authorize(principal: ApiPrincipal, name: string, confirmed = false) {
    const contract = this.contracts.find((x) => x.name === name);
    if (!contract) throw new BadRequestException("Unknown external AI tool");
    for (const scope of contract.requiredScopes)
      this.credentials.assertScope(principal, scope);
    if (contract.requiresConfirmation) {
      void confirmed;
      throw new ForbiddenException(
        "External AI write execution requires an approved confirmation workflow",
      );
    }
    return contract;
  }
}
