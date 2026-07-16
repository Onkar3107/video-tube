// src/types/express.d.ts
export {};

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        fullName: string;
        avatar: string;
      };
    }
  }
}
