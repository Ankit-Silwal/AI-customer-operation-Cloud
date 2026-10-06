import { authenticatedUserId, type HttpHandler } from "../../common/http.js";
import { id, object, text } from "../../common/validation.js";
import type { OrganizationService } from "./organization.service.js";

export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  create: HttpHandler = async (req, res) => {
    const body = object(req.body);
    res
      .status(201)
      .json(
        await this.service.create(
          { name: text(body.name, "name") },
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
