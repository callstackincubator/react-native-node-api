// Despite the name, this file isn't generated.

export interface TestSuite {
  [key: string]: TestSuite | (() => void);
}

export declare const suites: TestSuite;
