import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { fixture } from "./fixture.js";
import { MAX_UPLOAD_BYTES } from "../src/modules/documents/document.upload.js";
import { initializeDatabase } from "../src/database/database.js";

test("Text, Markdown and PDF uploads preserve bytes, metadata and account isolation", async (t) => {
  const { app, db, register, organization } = await fixture(t);
  const alice = await register("alice@example.com");
  const bob = await register("bob@example.com");
  const org = await organization(alice.token);
  const files = [
    { name: "notes.txt", mime: "text/plain", bytes: Buffer.from("Hello\nWorld\n") },
    { name: "notes.md", mime: "text/markdown", bytes: Buffer.from("# Hello\n") },
    { name: "notes.pdf", mime: "application/pdf", bytes: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n") },
  ];
  for (const file of files) {
    const uploaded = await request(app).post("/documents/upload").auth(alice.token, { type: "bearer" })
      .field("organizationId", org.id).field("title", "Notes")
      .attach("file", file.bytes, { filename: file.name, contentType: file.mime }).expect(201);
    assert.deepEqual(uploaded.body.upload, { fileName: file.name, mediaType: file.mime, byteLength: file.bytes.length });
    assert.equal(uploaded.body.content, file.mime === "application/pdf" ? "" : file.bytes.toString());
    const metadata = await request(app).get(`/documents/${uploaded.body.id}`).auth(alice.token, { type: "bearer" }).expect(200);
    assert.equal(metadata.body.upload.fileName, file.name);
    const download = await request(app).get(`/documents/${uploaded.body.id}/download`).auth(alice.token, { type: "bearer" })
      .buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
      }).expect(200);
    assert.deepEqual(download.body, file.bytes);
    assert.match(download.headers["content-disposition"], /^attachment;/);
    assert.equal(download.headers["x-content-type-options"], "nosniff");
    await request(app).get(`/documents/${uploaded.body.id}`).auth(bob.token, { type: "bearer" }).expect(404);
    await request(app).get(`/documents/${uploaded.body.id}/download`).auth(bob.token, { type: "bearer" }).expect(404);
  }
  await request(app).post("/documents/upload").auth(bob.token, { type: "bearer" })
    .field("organizationId", org.id).field("title", "Forbidden")
    .attach("file", Buffer.from("hello"), "notes.txt").expect(404);
  assert.equal((await db.query("SELECT * FROM documents")).rowCount, 3);
});

test("upload validation rejects unsupported, invalid, missing and oversized files", async (t) => {
  const { app, register, organization } = await fixture(t);
  const user = await register();
  const org = await organization(user.token);
  const upload = (bytes: Buffer, filename: string, contentType: string) => request(app).post("/documents/upload")
    .auth(user.token, { type: "bearer" }).field("organizationId", org.id).field("title", "Notes")
    .attach("file", bytes, { filename, contentType });
  await upload(Buffer.from("no"), "bad.exe", "application/octet-stream").expect(415);
  await upload(Buffer.from("not a pdf"), "bad.pdf", "application/pdf").expect(400);
  await upload(Buffer.from([0xff, 0xfe]), "bad.txt", "text/plain").expect(400);
  await upload(Buffer.from("bad\0text"), "bad.txt", "text/plain").expect(400);
  await upload(Buffer.alloc(0), "empty.txt", "text/plain").expect(400);
  await upload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65), "large.txt", "text/plain").expect(413);
  await request(app).post("/documents/upload").auth(user.token, { type: "bearer" })
    .field("organizationId", org.id).field("title", "Missing").expect(400);
  await request(app).post("/documents/upload").attach("file", Buffer.from("Hello"), "notes.txt").expect(401);
  await request(app).get(`/documents/${org.id}/download`).expect(401);
});

test("migration is repeatable and database constraints reject invalid direct writes", async (t) => {
  const { db, register, organization } = await fixture(t);
  const user = await register();
  const org = await organization(user.token);
  await initializeDatabase(db);
  assert.equal((await db.query("SELECT version FROM schema_migrations")).rowCount, 1);
  await assert.rejects(db.query("INSERT INTO organizations (name, owner_id) VALUES ('   ', $1)", [user.user.id]));
  await assert.rejects(db.query("INSERT INTO documents (organization_id, title, content) VALUES ($1, '', 'x')", [org.id]));
  await assert.rejects(db.query("INSERT INTO conversations (organization_id, customer_email, subject, messages) VALUES ($1, 'x@y.com', 'x', '{}')", [org.id]));
  const doc = await db.query("INSERT INTO documents (organization_id, title, content) VALUES ($1, 'Good', '') RETURNING id", [org.id]);
  await assert.rejects(db.query("INSERT INTO document_uploads (document_id, file_name, media_type, byte_length, file_data) VALUES ($1, 'x.txt', 'text/plain', 100, $2)", [doc.rows[0].id, Buffer.from("x")]));
});

test("real PostgreSQL rolls back document metadata when file persistence fails", { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
  const { db, prisma, register, organization } = await fixture(t);
  const { PrismaDocumentRepository } = await import("../src/modules/documents/document.repository.js");
  const user = await register();
  const org = await organization(user.token);
  const repository = new PrismaDocumentRepository(prisma);
  await assert.rejects(repository.createUploadForOwner({ organizationId: org.id, title: "Atomic", content: "x", fileName: "bad.txt", mediaType: "invalid", bytes: Buffer.from("x") }, user.user.id));
  assert.equal((await db.query("SELECT * FROM documents")).rowCount, 0);
});
