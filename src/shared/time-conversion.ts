
import * as moment from 'moment';

export function toGitlabStamp(time: moment.Moment) {
  return time.utcOffset(0).toISOString();
}

export function toMoment(gitlabStamp: string) {
  return moment(gitlabStamp);
}
