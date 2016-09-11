
import * as moment from 'moment';

export function toGitlabStamp(time: moment.Moment) {
  return time.utcOffset(0).format('YYYY-DD-MMTHH:mm:ss.SSS') + 'Z';
}

export function toMoment(gitlabStamp: string) {
  return moment(gitlabStamp);
}
