
/// <reference path="../../node_modules/inversify-dts/inversify/inversify.d.ts" />
import { injectable, inject, Kernel } from 'inversify';
import "reflect-metadata";

let TYPES = {
  Jepa: Symbol('jepa'),
  Hepo: Symbol('hepa')
}

interface Jepa {
  hello(): void;
}

@injectable()
class JepaA implements Jepa {
  hello() {
    console.log('JepaA');
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
  constructor(@inject(TYPES.Jepa) jepa : Jepa) {
    this.jepa = jepa;
  }
}

var kernel1 = new Kernel();
kernel1.bind<Jepa>(TYPES.Jepa).to(JepaA);
var kernel2 = new Kernel();
kernel2.bind<Jepa>(TYPES.Jepa).to(JepaB);

kernel1.bind<Hepo>(TYPES.Hepo).to(Hepo);
kernel2.bind<Hepo>(TYPES.Hepo).to(Hepo);

const hepo1 = kernel1.get<Hepo>(TYPES.Hepo);
hepo1.jepa.hello();

const hepo2 = kernel2.get<Hepo>(TYPES.Hepo);
hepo2.jepa.hello();
