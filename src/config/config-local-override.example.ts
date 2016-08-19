
import { Kernel, interfaces } from 'inversify';

import { ENV } from '../shared/types';

import {
  LocalScreenshotter,
  screenshotterInjectSymbol,
} from '../screenshot';

export default (kernel: interfaces.Kernel, env: ENV) => {
  kernel.unbind(screenshotterInjectSymbol);
  kernel.bind(screenshotterInjectSymbol).to(LocalScreenshotter);
};
