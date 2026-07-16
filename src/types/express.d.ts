// src/types/express.d.ts

export interface AuthUser {
  _id: string;
  username: string;
  email: string;
  fullName: string;
  avatar: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
