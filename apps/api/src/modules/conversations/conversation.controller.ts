import { authenticatedUserId, type HttpHandler } from "../../common/http.js";
import { id } from "../../common/validation.js";
import type { ConversationService } from "./conversation.service.js";
import { parseConversation } from "./conversation.validation.js";

export class ConversationController {
  constructor(private readonly service: ConversationService) {}

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
