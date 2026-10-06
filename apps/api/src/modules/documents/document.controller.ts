import { authenticatedUserId, type HttpHandler } from "../../common/http.js";
import { id, object, text } from "../../common/validation.js";
import type { DocumentService } from "./document.service.js";

export class DocumentController {
  constructor(private readonly service: DocumentService) {}

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
