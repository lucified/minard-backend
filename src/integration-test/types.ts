import { Response } from 'node-fetch';
import { JsonApiEntity } from '../json-api/types';
import CharlesClient from './charles-client';

export interface Auth0 {
  domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}
export interface Config {
  charles: string;
  auth0: {
    regular: Auth0;
    open: Auth0;
    admin: Auth0;
    [key: string]: Auth0;
  };
  notifications?: NotificationConfigurations;
}

export interface NotificationConfigurations {
  flowdock?: FlowdockNotificationConfiguration;
  hipchat?: HipChatNotificationConfiguration;
  slack?: SlackNotificationConfiguration;
}
interface HipChatNotificationConfiguration {
  type: 'hipchat';
  hipchatRoomId: number;
  hipchatAuthToken: string;
}

interface FlowdockNotificationConfiguration {
  type: 'flowdock';
  flowToken: string;
}

interface SlackNotificationConfiguration {
  type: 'slack';
  slackWebhookUrl: string;
}

export interface SSE {
  type: string;
  lastEventId: string;
  data: any;
}
export interface CharlesClients {
  regular: CharlesClient;
  admin: CharlesClient;
  unauthenticated: CharlesClient;
  open: CharlesClient;
}

export interface CharlesResponse<T> extends Response {
  toJson: () => Promise<T>;
  getEntity: () => Promise<JsonApiEntity>;
  getEntities: () => Promise<JsonApiEntity[]>;
}

export type AccessCode = '1' | 'x' | 'r';

export interface EntityResponse {
  own: AccessCode;
  closed: AccessCode;
  open: AccessCode;
  missing: AccessCode;
}
export type EntityType = keyof EntityResponse;
export interface AccessMatrix {
  regular: EntityResponse;
  admin: EntityResponse;
  unauthenticated: EntityResponse;
}
export type UserType = keyof AccessMatrix;
export interface Route {
  description: string;
  request: (me: CharlesClient, other: CharlesClient) => Promise<Response>;
  accessMatrix: AccessMatrix;
}

export interface LatestDeployment {
  id: string;
  url: string;
  screenshot: string;
  token: string;
}
export interface LatestProject {
  id: number;
  repoUrl: string;
  token: string;
}

export interface OperationsResponse {
  status: number;
  message: string;
}
