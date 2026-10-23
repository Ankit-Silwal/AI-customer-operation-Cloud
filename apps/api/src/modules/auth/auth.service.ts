import { HttpError } from "../../common/http.js";
import type { AuthRepository } from "./auth.repository.js";
import type { AuthResponse, LoginInput, RegisterInput } from "./auth.types.js";
import { hashPassword, verifyPassword } from "./password.js";
import type { TokenService } from "./token.service.js";

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput): Promise<AuthResponse> {
    const user = await this.repository.create(
      input.name,
      input.email,
      await hashPassword(input.password),
    );
    return { user, token: this.tokens.create(user.id) };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const storedUser = await this.repository.findByEmail(input.email);
    if (
      !storedUser ||
      !(await verifyPassword(input.password, storedUser.passwordHash))
    ) {
      throw new HttpError(401, "Invalid email or password");
    }
    const user = {
      id: storedUser.id,
      name: storedUser.name,
      email: storedUser.email,
      createdAt: storedUser.createdAt,
    };
    return { user, token: this.tokens.create(user.id, 7 * 86400, storedUser.authVersion ?? 0) };
  }
}
