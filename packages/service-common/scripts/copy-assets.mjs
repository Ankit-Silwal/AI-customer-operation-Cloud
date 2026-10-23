import { copyFileSync } from "node:fs";
for (const file of ["rate-policies.json", "rate-limit.lua"]) {
  copyFileSync(new URL(`../src/${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url));
}
