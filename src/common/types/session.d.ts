import 'express-session';

declare module 'express-session' {
  interface SessionData {
    user?: {
      sub: string;
      email: string;
      role: string;
      name?: string;
    };
  }
}
