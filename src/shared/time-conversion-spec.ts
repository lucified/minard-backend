import { expect } from 'chai';
import * as moment from 'moment';

import { toGitlabTimestamp } from './time-conversion';

describe('time-conversion', () => {
  it('should convert a date correctly', () => {
    const mom = moment(1473689537148);
    const stamp = toGitlabTimestamp(mom);
    expect(stamp).to.equal('2016-09-12T14:12:17.148Z');
  });
});
