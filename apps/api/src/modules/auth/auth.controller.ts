import type { HttpHandler } from "../../common/http.js";
import { email, object, password, text } from "../../common/validation.js";
import type { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register: HttpHandler = async (req, res) => {
    const body = object(req.body);
    const input = {
      name: text(body.name, "name"),
      email: email(body.email),
      password: password(body.password),
    };
    res.status(201).json(await this.service.register(input));
  };

  login: HttpHandler = async (req, res) => {
    const body = object(req.body);
    res.json(
      await this.service.login({
        email: email(body.email),
        password: password(body.password),
      }),
    );
  };
}
