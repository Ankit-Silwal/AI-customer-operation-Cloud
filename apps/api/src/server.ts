import { readServiceRole } from "./services.js";
import { startDomainServer } from "./runtime/domain-server.js";

await startDomainServer(readServiceRole(process.env.SERVICE_ROLE));
