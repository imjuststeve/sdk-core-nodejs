/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Friday, 17th August 2018 9:43:36 am
 * @Email:  developer@xyfindables.com
 * @Filename: lib.spec.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Friday, 17th August 2018 9:58:10 am
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { HashProvider } from '../../src';

describe(`Library Exports`, () => {
  it(`Should export a HashProvider that implements the IHashProvider interface`, () => {
    const hashProvider = new HashProvider();
    expect(hashProvider.getCanonicalName).toBeTruthy();
    expect(hashProvider.getMajor).toBeTruthy();
    expect(hashProvider.getMinor).toBeTruthy();
    expect(hashProvider.hash).toBeTruthy();
    expect(hashProvider.verifyHash).toBeTruthy();
  });
});