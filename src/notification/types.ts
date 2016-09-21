
export type NotificationType = 'flowdock';

export interface FlowdockNotificationConfiguration extends NotificationConfiguration {
  type: 'flowdock';
  options: {
    flowToken: string;
  };
}

export interface NotificationConfiguration {
  id?: number;
  projectId: number;
  type: NotificationType;
  options: any;
}
