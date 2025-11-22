import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check if session exists and has userId
    if (request.session && request.session.user) {
      // Attach user object to req.user for controller
      request.user = request.session.user;
      return true;
    }

    return false;
  }
}
