import * as moment from 'moment';

export function toGitlabTimestamp(time: moment.Moment) {
  return time.toISOString();
}

export function toMoment(gitlabTimestamp: string) {
  return moment(gitlabTimestamp);
}
