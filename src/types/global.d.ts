declare var process: any;
declare var Buffer: any;

declare module "crypto" {
  const anything: any;
  export = anything;
}

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(actual: any): any;
