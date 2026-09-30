import type { Request } from 'express';

export interface RequestStaff {
  id: string;
  businessId: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export interface RequestWithContext extends Request {
  requestId: string;
  staff?: RequestStaff;
  sessionHash?: string;
}
