
import { eventCreator } from '../shared/events';

export interface SystemHookRegistrationEvent {
  readonly status: 'success' | 'failed';
  readonly path: string;
  readonly message?: string;
}

export const SYSTEM_HOOK_REGISTRATION_EVENT_TYPE = 'SYSTEM_HOOK_REGISTRATION_EVENT_TYPE';
export const createSystemHookRegistrationEvent =
  eventCreator<SystemHookRegistrationEvent>(SYSTEM_HOOK_REGISTRATION_EVENT_TYPE);
