import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NestMiddleware } from "@nestjs/common";
import { Injectable } from "@nestjs/common";

export interface RequestContextValue {
  requestId: string;
  tenantId?: string;
  actorId?: string;
  actorType?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<RequestContextValue>();
const validRequestId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const requestContext = {
  get: () => storage.getStore(),
  setIdentity: (actorId: string, actorType: string) => {
    const context = storage.getStore();
    if (context) Object.assign(context, { actorId, actorType });
  },
  setRequest: (tenantId?: string, route?: string) => {
    const context = storage.getStore();
    if (context) Object.assign(context, { tenantId, route });
  },
};

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  routeOptions?: { url?: string };
  url?: string;
  requestId?: string;
}
interface ResponseLike {
  header(name: string, value: string): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: RequestLike, res: ResponseLike, next: () => void): void {
    const provided = req.headers["x-request-id"];
    const candidate = Array.isArray(provided) ? provided[0] : provided;
    const requestId =
      candidate && validRequestId.test(candidate) ? candidate : randomUUID();
    req.requestId = requestId;
    res.header("x-request-id", requestId);
    storage.run(
      {
        requestId,
        tenantId: req.params?.businessId,
        route: req.routeOptions?.url ?? req.url?.split("?")[0],
      },
      next,
    );
  }
}
