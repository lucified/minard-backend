
export type NotificationType = 'flowdock';

export interface FlowdockNotificationConfiguration extends NotificationConfiguration {
  type: 'flowdock';
  flowToken: string;
}

export interface NotificationConfiguration {
  id?: number;
  projectId: number;
  type: NotificationType;
  [others: string]: any;
}
