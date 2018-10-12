/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 30th August 2018 1:18:58 pm
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-signature-set.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 11th October 2018 11:47:12 am
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoObject } from '../../../xyo-core-components/xyo-object';
import { XyoArray } from '../../../xyo-core-components/arrays/xyo-array';

/**
 * An XyoSignatureSet is a collection of non-homogenous
 * signatures who's total size should not exceed 2 ^ 16 - 1 bytes when packed.
 *
 * A `XyoSignatureSet` is generally used in bound-witnesses for verification
 * that two parties agreed on the same data in the signed payload.
 */

export class XyoSignatureSet extends XyoArray {

  public static major = 0x02;
  public static minor = 0x03;

  /**
   * Creates a new instance of a XyoSignatureSet
   *
   * @param array A collection of signatures
   */

  constructor (public readonly array: XyoObject[]) {
    super(undefined, undefined, XyoSignatureSet.major, XyoSignatureSet.minor, 2, array);
  }
}