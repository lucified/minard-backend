
import { Kernel, interfaces } from 'inversify';

import { ENV } from '../shared/types';

import {
  screenshotterInjectSymbol,
} from '../screenshot';

// This requires the webshot package to be installed
import {
  LocalScreenshotter,
} from '../screenshot/screenshotter-local';


export default (kernel: interfaces.Kernel, env: ENV) => {
  kernel.unbind(screenshotterInjectSymbol);
  kernel.bind(screenshotterInjectSymbol).to(LocalScreenshotter);
};
