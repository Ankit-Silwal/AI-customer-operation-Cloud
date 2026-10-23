import { pagination } from "@repo/service-common/pagination";
import { authenticatedUserId, type HttpHandler } from "@repo/service-common/http";
import { id, object } from "@repo/service-common/validation";
import type { ConversationService } from "./conversation.service.js";
import { HttpError } from "@repo/service-common/http";
import { parseConversation, parseMessages } from "./conversation.validation.js";

export class ConversationController {
  constructor(private readonly service: ConversationService) {}

  append: HttpHandler = async (req, res) => {
    const body = object(req.body);
    const messages = parseMessages(body.messages);
    const expected = body.expectedCount;
    if (!Number.isInteger(expected) || Number(expected) < 0 || !messages.length || messages.length > 10 || Number(expected) + messages.length > 100) throw new HttpError(400, "Append requires 1 to 10 messages and a matching count within the 100-message limit");
    res.json(await this.service.append(id(req.params.id), authenticatedUserId(res.locals), Number(expected), messages));
  };

  list: HttpHandler = async (req, res) => { res.json(await this.service.list(id(req.query.organizationId, "organizationId"), authenticatedUserId(res.locals), pagination(req.query))); };

  create: HttpHandler = async (req, res) => {
    res
      .status(201)
      .json(
        await this.service.create(
          parseConversation(req.body),
          authenticatedUserId(res.locals),
        ),
      );
  };

  getById: HttpHandler = async (req, res) => {
    res.json(
      await this.service.getById(
        id(req.params.id),
        authenticatedUserId(res.locals),
      ),
    );
  };
}
