import { parseArgs } from "node:util";
import { createDatabase } from "../database/database.js";
import { createPrisma } from "../database/prisma.js";
import { issueKey, scopes } from "../modules/developer/developer.service.js";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { organization: { type: "string" }, name: { type: "string" }, scopes: { type: "string", default: "chat:write,documents:read,documents:write,otp:write" }, days: { type: "string", default: "90" }, id: { type: "string" } } });
const url = process.env.ORGANIZATIONS_DATABASE_URL;
if (!url) throw new Error("ORGANIZATIONS_DATABASE_URL is required; run this command in the core container");
const pool = createDatabase(url);
const db = createPrisma(pool);
try {
  if (positionals[0] === "issue" && values.organization && values.name) console.log(JSON.stringify(await issueKey(db, values.organization, values.name, scopes(values.scopes.split(",")), Number(values.days)), null, 2));
  else if (positionals[0] === "revoke" && values.id) { await db.developerApiKey.update({ where: { id: values.id }, data: { revokedAt: new Date() } }); console.log("API key revoked"); }
  else throw new Error("Usage: developer.js issue --organization UUID [--scopes chat:write,otp:write] --name NAME [--days 90] | revoke --id UUID");
} catch (error) { console.error(error instanceof Error ? error.message : "Operator command failed"); process.exitCode = 1; }
finally { await db.$disconnect(); await pool.end(); }
