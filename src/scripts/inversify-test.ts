

import 'reflect-metadata';

import { Kernel, inject, injectable } from 'inversify';

let TYPES = {
  Hepo: Symbol(),
  Jepa: Symbol(),
};

abstract class Jepa {
  public static injectName = Symbol();
  public abstract hello();
}

abstract class Bepa {
  public static injectName = Symbol();
  public abstract whoa();
}

@injectable()
class JepaA implements Jepa, Bepa {
  public hello() {
    console.log('JepaA'); // tslint:disable-line
  }
  public whoa() {
    console.log('whoaA'); // tslint:disable-line
  }
}

@injectable()
class JepaB implements Jepa {
  public hello() {
    console.log('JepaB'); // tslint:disable-line
  }
}

@injectable()
class Hepo {
  private jepa: Jepa;
  constructor(@inject(Jepa.injectName) jepa: Jepa) {
    this.jepa = jepa;
  }
}


const kernel1 = new Kernel();
kernel1.bind(Jepa.injectName).to(JepaA);
const kernel2 = new Kernel();
kernel2.bind(Jepa.injectName).to(JepaB);

kernel1.bind(TYPES.Hepo).to(Hepo);
kernel2.bind(TYPES.Hepo).to(Hepo);

const hepo1 = kernel1.get<Hepo>(TYPES.Hepo);
hepo1.jepa.hello();

const hepo2 = kernel2.get<Hepo>(TYPES.Hepo);
hepo2.jepa.hello();
