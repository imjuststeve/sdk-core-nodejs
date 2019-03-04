/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Thursday, 28th February 2019 6:24:26 pm
 * @Email:  developer@xyfindables.com
 * @Filename: xyo-proof-of-intersection-validator.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 28th February 2019 7:07:02 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { XyoBase } from '@xyo-network/base'
import { IProofOfIntersection } from './@types'
import { IParameterizedProvider } from '@xyo-network/utils'
import { XyoError, XyoErrors } from '@xyo-network/errors'
import { IXyoSerializationService } from '@xyo-network/serialization'
import { IXyoBoundWitness } from '@xyo-network/bound-witness'

export class XyoProofOfIntersectionValidator extends XyoBase {

  constructor(
    private readonly contentService: IParameterizedProvider<string, Buffer | undefined>,
    private readonly serializationService: IXyoSerializationService
  ) {
    super()
  }

  public async validate(proof: IProofOfIntersection): Promise<void> {
    const intersectionHash = proof.answer.hash
    const bwIntersection = (await this.contentService.get(intersectionHash)) as Buffer
    if (!bwIntersection) throw new XyoError(`Could not find block ${intersectionHash}`, XyoErrors.CRITICAL)
    const bw = this.serializationService.deserialize(bwIntersection).hydrate<IXyoBoundWitness>()
    if (bw.numberOfParties !== 2) {
      throw new XyoError(`Could not validate block ${intersectionHash}. Requires 2 parties`, XyoErrors.CRITICAL)
    }
  }
}
