declare var process: any;
declare var Buffer: any;

declare module "crypto" {
  const anything: any;
  export = anything;
}

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(actual: any): any;

declare function beforeEach(fn: () => void): void;

declare const jest: {
  fn: (...args: any[]) => any;
  spyOn: (...args: any[]) => any;
  resetAllMocks: () => void;
  clearAllMocks: () => void;
  [key: string]: any;
};
