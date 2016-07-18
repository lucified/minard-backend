
/// <reference path="../../node_modules/inversify-dts/inversify/inversify.d.ts" />
import { injectable, inject, Kernel } from 'inversify';
import "reflect-metadata";
//import { Jepa, name } from '../Jepa';

let TYPES = {
  Jepa: Symbol(),
  Hepo: Symbol()
}

abstract class Jepa {
  static injectName = Symbol();
  abstract hello();
}

abstract class Bepa {
  static injectName = Symbol();
  abstract whoa();
}

@injectable()
class JepaA implements Jepa, Bepa {
  hello() {
    console.log('JepaA');
  }
  whoa() {
    console.log('whoaA');
  }
}

@injectable()
class JepaB implements Jepa {
  hello() {
    console.log('JepaB');
  }
}

@injectable()
class Hepo {
  jepa: Jepa;
  constructor(@inject(Jepa.injectName) jepa : Jepa) {
    this.jepa = jepa;
  }
}


var kernel1 = new Kernel();
kernel1.bind(Jepa.injectName).to(JepaA);
var kernel2 = new Kernel();
kernel2.bind(Jepa.injectName).to(JepaB);

kernel1.bind(TYPES.Hepo).to(Hepo);
kernel2.bind(TYPES.Hepo).to(Hepo);

const hepo1 = kernel1.get<Hepo>(TYPES.Hepo);
hepo1.jepa.hello();

const hepo2 = kernel2.get<Hepo>(TYPES.Hepo);
hepo2.jepa.hello();
