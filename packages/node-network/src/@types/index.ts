/*
 * @Author: XY | The Findables Company <ryanxyo>
 * @Date:   Monday, 28th January 2019 5:15:58 pm
 * @Email:  developer@xyfindables.com
 * @Filename: index.ts
 * @Last modified by: ryanxyo
 * @Last modified time: Thursday, 28th February 2019 3:36:03 pm
 * @License: All Rights Reserved
 * @Copyright: Copyright XY | The Findables Company
 */

import { unsubscribeFn } from '@xyo-network/utils'
import { IRequestPermissionForBlockResult } from '@xyo-network/attribution-request'
import { IXyoHash } from '@xyo-network/hashing'
import { IXyoTransaction } from '@xyo-network/transaction-pool'
import { BigNumber } from 'bignumber.js'
import { IConsensusProvider } from '@xyo-network/consensus'

export interface IXyoNodeNetwork {

  /**
   * The features you will share with the network when requested
   *
   * @param {IXyoComponentFeatureResponse} features
   * @memberof IXyoNodeNetwork
   */
  setFeatures(features: IXyoComponentFeatureResponse): void

  /**
   * Request feature-set from nodes in the network
   *
   * @param {(publicKey: string, featureRequest: IXyoComponentFeatureResponse) => void} callback
   * @returns {unsubscribeFn} A function that can be used to stop subscribing to responses
   * @memberof IXyoNodeNetwork
   */
  requestFeatures(callback: (publicKey: string, featureRequest: IXyoComponentFeatureResponse) => void): unsubscribeFn

  requestPermissionForBlock(
    blockHash: IXyoHash,
    callback: (publicKey: string, permissionRequest: IRequestPermissionForBlockResult) => void
  ): unsubscribeFn

  serviceBlockPermissionRequests(): unsubscribeFn

  shareTransaction(transaction: IXyoTransaction<any>): Promise<void>
  listenForTransactions(): unsubscribeFn

  requestSignaturesForBlockCandidate(
    candidate: IBlockWitnessRequestDTO,
    callback: (publicKey: string, signatureComponents: { r: string, s: string, v: string}) => void
  ): unsubscribeFn

  listenForBlockWitnessRequests(consensusProvider: IConsensusProvider): unsubscribeFn
}

export interface IXyoComponentArchivistFeatureDetail {
  graphqlHost: string
  graphqlPort: number
  boundWitnessHost: string
  boundWitnessPort: number
}

// tslint:disable-next-line:no-empty-interface
export interface IXyoComponentDivinerFeatureDetail {
}

export interface IXyoComponentFeatureResponse {
  archivist?: IXyoComponentFeatureDetail<IXyoComponentArchivistFeatureDetail>,
  diviner?: IXyoComponentFeatureDetail<IXyoComponentDivinerFeatureDetail>,
}

export interface IXyoComponentFeatureDetail<T extends {}> {
  featureType: string
  supportsFeature: boolean,
  featureOptions: T
}

export interface IBlockWitnessRequestDTO {
  blockHash: string
  agreedStakeBlockHeight: string
  previousBlockHash: string
  supportingDataHash: string
  requests: string[],
  responses: string
}

export interface IBlockWitnessRequest {
  blockHash: BigNumber
  agreedStakeBlockHeight: BigNumber,
  previousBlockHash: BigNumber
  supportingDataHash: Buffer
  requests: BigNumber[],
  responses: Buffer
}
