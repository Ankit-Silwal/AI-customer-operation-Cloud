export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserWithPassword extends User {
  authVersion?: number;
  passwordHash: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
