
export type NotificationType = 'flowdock' | 'hipchat';

export interface HipChatNotificationConfiguration extends NotificationConfiguration {
  type: 'hipchat';
  hipchatRoomId: number;
  hipchatAuthToken: string;
}

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
