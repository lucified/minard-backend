

import 'reflect-metadata';

import { Kernel, inject, injectable } from 'inversify';


abstract class Jepa {
  public static injectName = Symbol('jepa');
  public abstract hello(): void;
}

abstract class Bepa {
  public static injectName = Symbol('bepa');
  public abstract whoa(): void;
}

@injectable()
class JepaA implements Jepa, Bepa {
  public hello() {
    console.log('JepaA');
  }
  public whoa() {
    console.log('whoaA');
  }
}

@injectable()
class JepaB implements Jepa {
  public hello() {
    console.log('JepaB');
  }
}

@injectable()
class Hepo {
  public static injectName = Symbol('hepo');

  private _jepa: Jepa;
  private _bepa: Bepa;

  constructor(@inject(Jepa.injectName) jepa: Jepa, @inject(Bepa.injectName) bepa: Bepa) {
    this._jepa = jepa;
    this._bepa = bepa;
  }

  public get jepa(): Jepa {
    return this._jepa;
  }

  public get bepa(): Bepa {
    return this._bepa;
  }

}


const kernel1 = new Kernel();
kernel1.bind(Jepa.injectName).to(JepaA);
kernel1.bind(Bepa.injectName).to(JepaA);
const kernel2 = new Kernel();
kernel2.bind(Jepa.injectName).to(JepaB);
kernel2.bind(Bepa.injectName).to(JepaA);

kernel1.bind(Hepo.injectName).to(Hepo);
kernel2.bind(Hepo.injectName).to(Hepo);

const hepo1 = kernel1.get<Hepo>(Hepo.injectName);
hepo1.jepa.hello();

const hepo2 = kernel2.get<Hepo>(Hepo.injectName);
hepo2.jepa.hello();
