import { copyFile, mkdir } from "node:fs/promises";

const source = new URL("../src/database/schema.sql", import.meta.url);
const destination = new URL("../dist/database/schema.sql", import.meta.url);
await mkdir(new URL("../dist/database/", import.meta.url), { recursive: true });
await copyFile(source, destination);
