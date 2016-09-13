
import * as moment from 'moment';

export function toGitlabStamp(time: moment.Moment) {
  return time.toISOString();
}

export function toMoment(gitlabStamp: string) {
  return moment(gitlabStamp);
}
