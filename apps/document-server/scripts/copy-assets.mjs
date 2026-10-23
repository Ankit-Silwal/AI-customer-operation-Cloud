import { copyFile } from "node:fs/promises";
await copyFile(new URL("../src/database/schema.sql", import.meta.url), new URL("../dist/database/schema.sql", import.meta.url));
