import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { TokenService } from '../services/token.service';
import { AuthService } from '../services/auth.service';

const addToken = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const tokenService = inject(TokenService);
  const authService  = inject(AuthService);

  const token     = tokenService.getAccessToken();
  const authedReq = token ? addToken(req, token) : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      // Admin tokens don't refresh — a 401 means the session expired → sign out
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        !req.url.includes('/admin/auth/')
      ) {
        authService.signOut();
      }
      return throwError(() => err);
    }),
  );
};
