import { pagination } from "@repo/service-common/pagination";
import { authenticatedUserId, type HttpHandler } from "@repo/service-common/http";
import { id, object, text } from "@repo/service-common/validation";
import type { DocumentService } from "./document.service.js";
import { validateFile } from "./document.upload.js";

export class DocumentController {
  constructor(private readonly service: DocumentService) {}

  upload: HttpHandler = async (req, res) => {
    const body = object(req.body);
    const input = { ...validateFile(req.file), organizationId: id(body.organizationId, "organizationId"), title: text(body.title, "title") };
    res.status(201).json(await this.service.upload(input, authenticatedUserId(res.locals)));
  };

  get: HttpHandler = async (req, res) => {
    res.json(await this.service.get(id(req.params.id, "id"), authenticatedUserId(res.locals)));
  };

  download: HttpHandler = async (req, res) => {
    const file = await this.service.download(id(req.params.id, "id"), authenticatedUserId(res.locals));
    res.attachment(file.fileName).type(file.mediaType).send(file.bytes);
  };

  list: HttpHandler = async (req, res) => { res.json(await this.service.list(id(req.query.organizationId, "organizationId"), authenticatedUserId(res.locals), pagination(req.query))); };

  create: HttpHandler = async (req, res) => {
    const body = object(req.body);
    const input = {
      organizationId: id(body.organizationId, "organizationId"),
      title: text(body.title, "title"),
      content: text(body.content, "content", 200000),
    };
    res
      .status(201)
      .json(await this.service.create(input, authenticatedUserId(res.locals)));
  };
}
